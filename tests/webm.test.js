'use strict';
// A live WebM made seekable (public/webm.js): what Record to a file on disk does with the file when it is saved. The
// input here is built in the layout Chromium's MediaRecorder writes (read from a real recording: the EBML header, a
// Segment and Clusters of unknown size, Info without a duration, no SeekHead, no Cues; Opus in SimpleBlocks, VP9 in
// SimpleBlocks or, with alpha, in BlockGroups). The output is read back with a separate minimal EBML reader.
const test=require('node:test'),assert=require('node:assert/strict');
const W=require('../public/webm.js');
const {ID}=W;
// ---- Writing a recorder's live file -----------------------------------------------------------------------------------
const cat=(...p)=>W.concat(p.flat());
const el=(id,...payload)=>W.element(id,...payload.flat());
const UNKNOWN=Uint8Array.from([0x01,0xff,0xff,0xff,0xff,0xff,0xff,0xff]);
const live=(id,...children)=>cat(W.idBytes(id),UNKNOWN,...children);
const u=(n,len)=>W.uintBytes(n,len);
const str=s=>Uint8Array.from(Buffer.from(s,'latin1'));
const AUDIO=1,VIDEO=2;
function simpleBlock(track,rel,key,size){const p=new Uint8Array(size);p[0]=0x80|track;p[1]=(rel>>8)&0xff;p[2]=rel&0xff;p[3]=key?0x80:0;for(let i=4;i<size;i++)p[i]=(i*31+rel)&0xff;return el(ID.SIMPLEBLOCK,p);}
function groupBlock(track,rel,key,size){const p=new Uint8Array(size);p[0]=0x80|track;p[1]=(rel>>8)&0xff;p[2]=rel&0xff;p[3]=0;for(let i=4;i<size;i++)p[i]=(i*7+rel)&0xff;
  return el(ID.GROUP,el(ID.BLOCK,p),el(0x75a1,new Uint8Array(20)),key?[]:[el(ID.REFERENCE,u(1))]);}
// `clusters` clusters of `perCluster` ms each: audio every 60 ms, video every 33 ms (a keyframe first in each cluster).
function recording({clusters=6,perCluster=1000,groups=false,videoBytes=900,width=1280,height=720}={}){
  const head=cat(el(ID.EBML,el(0x4286,u(1)),el(0x42f7,u(1)),el(0x42f2,u(4)),el(0x42f3,u(8)),el(0x4282,str('webm')),el(0x4287,u(4)),el(0x4285,u(2))));
  const info=el(ID.INFO,el(ID.SCALE,u(1000000,3)),el(0x4d80,str('Chrome')),el(0x5741,str('Chrome')));
  const tracks=el(ID.TRACKS,el(ID.TRACK,el(ID.TRACKNUMBER,u(AUDIO)),el(ID.TRACKTYPE,u(2)),el(0x86,str('A_OPUS'))),
    el(ID.TRACK,el(ID.TRACKNUMBER,u(VIDEO)),el(ID.TRACKTYPE,u(1)),el(0x86,str('V_VP9')),el(ID.VIDEO,el(ID.WIDTH,u(width)),el(ID.HEIGHT,u(height)))));
  const parts=[];const keys=[];let last=0;
  for(let c=0;c<clusters;c++){
    const tc=c*perCluster,blocks=[];const items=[];
    for(let t=0;t<perCluster;t+=60)items.push({track:AUDIO,t,key:true});
    for(let t=0;t<perCluster;t+=33)items.push({track:VIDEO,t,key:t===0});
    items.sort((a,b)=>a.t-b.t||a.track-b.track);
    for(const it of items){blocks.push(it.track===VIDEO?(groups?groupBlock:simpleBlock)(VIDEO,it.t,it.key,videoBytes+(it.key?2000:0)):simpleBlock(AUDIO,it.t,true,240));last=Math.max(last,tc+it.t);if(it.track===VIDEO&&it.key)keys.push(tc+it.t);}
    parts.push(live(ID.CLUSTER,el(ID.TIMECODE,u(tc)),...blocks));
  }
  const bytes=cat(head,live(ID.SEGMENT,info,tracks,...parts));
  return {bytes,keys,last};
}
function feedInChunks(bytes,sizes){const s=W.scanner();let i=0,k=0;while(i<bytes.length){const n=sizes[k++%sizes.length];s.feed(bytes.subarray(i,i+n));i+=n;}return s.index();}
// ---- Reading EBML back (independent of the module under test) ---------------------------------------------------------
function vint(b,i,id){const f=b[i];let l=1;for(let m=0x80;!(f&m);m>>=1)l++;let v=id?f:f&(0xff>>l),ones=(f&(0xff>>l))===(0xff>>l);for(let k=1;k<l;k++){v=v*256+b[i+k];if(b[i+k]!==0xff)ones=false;}return {v:!id&&ones?null:v,l};}
function elements(b,from,to){const out=[];let i=from;while(i<to){const a=vint(b,i,true),s=vint(b,i+a.l,false);const start=i,data=i+a.l+s.l;assert.notEqual(s.v,null,`unknown size at ${i} (id ${a.v.toString(16)})`);
  out.push({id:a.v,start,data,end:data+s.v});i=data+s.v;}assert.equal(i,to,'elements end exactly at their parent’s end');return out;}
const num=(b,e)=>{let v=0;for(let i=e.data;i<e.end;i++)v=v*256+b[i];return v;};
function read(b){
  const top=elements(b,0,b.length);
  assert.deepEqual(top.map(e=>e.id),[ID.EBML,ID.SEGMENT],'an EBML header and one Segment of known size, nothing after it');
  const seg=top[1],kids=elements(b,seg.data,seg.end);
  const at=id=>kids.filter(k=>k.id===id);
  const info=elements(b,at(ID.INFO)[0].data,at(ID.INFO)[0].end),dur=info.find(k=>k.id===ID.DURATION);
  const seek=elements(b,at(ID.SEEKHEAD)[0].data,at(ID.SEEKHEAD)[0].end).map(s=>{const c=elements(b,s.data,s.end);return {id:num(b,c.find(x=>x.id===ID.SEEKID)),pos:num(b,c.find(x=>x.id===ID.SEEKPOS))};});
  const clusters=at(ID.CLUSTER).map(c=>{const ch=elements(b,c.data,c.end);return {start:c.start-seg.data,tc:num(b,ch.find(x=>x.id===ID.TIMECODE)),blocks:ch.filter(x=>x.id===ID.SIMPLEBLOCK||x.id===ID.GROUP).length,end:c.end};});
  const cues=at(ID.CUES).length?elements(b,at(ID.CUES)[0].data,at(ID.CUES)[0].end).map(p=>{const c=elements(b,p.data,p.end),pos=elements(b,c.find(x=>x.id===ID.CUEPOSITIONS).data,c.find(x=>x.id===ID.CUEPOSITIONS).end);
    return {time:num(b,c.find(x=>x.id===ID.CUETIME)),track:num(b,pos.find(x=>x.id===ID.CUETRACK)),cluster:num(b,pos.find(x=>x.id===ID.CUECLUSTER))};}):[];
  return {seg,kids,duration:dur?new DataView(b.buffer,b.byteOffset+dur.data,8).getFloat64(0):null,seek,clusters,cues,order:kids.map(k=>k.id)};
}

test('the index is the same however the bytes arrive (one at a time, small or large chunks)',()=>{
  const {bytes,keys,last}=recording();
  const whole=feedInChunks(bytes,[bytes.length]);
  assert.equal(whole.ok,true);assert.equal(whole.video,VIDEO);assert.equal(whole.width,1280);assert.equal(whole.height,720);
  assert.equal(whole.clusters.length,6);assert.deepEqual(whole.cues.map(c=>c.time),keys);assert.equal(whole.maxTime,last);assert.equal(whole.complete,bytes.length);
  const strip=ix=>JSON.stringify({...ix,ebml:[...ix.ebml],info:ix.info.map(x=>[...x]),tracks:[...ix.tracks]});
  for(const sizes of [[1],[7,3,11],[4096],[65536,1,13]])assert.equal(strip(feedInChunks(bytes,sizes)),strip(whole),`chunks of ${sizes}`);
});

test('the saved file is seekable: sizes, a SeekHead, the duration, Cues on video keyframes, payload unchanged',async()=>{
  const {bytes,keys,last}=recording();
  const out=await W.seekable(bytes),b=out.bytes,r=read(b);
  assert.deepEqual(r.order,[ID.SEEKHEAD,ID.INFO,ID.TRACKS,...Array(6).fill(ID.CLUSTER),ID.CUES]);
  assert.equal(r.duration,last);assert.equal(out.plan.durationMs,last);
  // The SeekHead points at the Info, the Tracks and the Cues (positions from the Segment's data).
  for(const s of r.seek){const k=r.kids.find(x=>x.start-r.seg.data===s.pos);assert.ok(k,`seek position ${s.pos}`);assert.equal(k.id,s.id);}
  assert.deepEqual(r.seek.map(s=>s.id).sort(),[ID.INFO,ID.TRACKS,ID.CUES].sort());
  // One cue per cluster, at its keyframe, pointing at the cluster.
  assert.deepEqual(r.cues.map(c=>c.time),keys);assert.ok(r.cues.every(c=>c.track===VIDEO));
  assert.deepEqual(r.cues.map(c=>c.cluster),r.clusters.map(c=>c.start));
  assert.deepEqual(r.clusters.map(c=>c.tc),[0,1000,2000,3000,4000,5000]);
  // The clusters' bytes after their headers are the input's, unchanged.
  const inClusters=[];for(let k=0;k<bytes.length-3;k++)if(bytes[k]===0x1f&&bytes[k+1]===0x43&&bytes[k+2]===0xb6&&bytes[k+3]===0x75)inClusters.push(k);
  const outClusters=r.clusters.map(c=>c.start+r.seg.data);
  for(let k=0;k<inClusters.length;k++){const a=bytes.subarray(inClusters[k]+12,(inClusters[k+1]||bytes.length)),c=b.subarray(outClusters[k]+12,r.clusters[k].end);assert.deepEqual(Buffer.from(c),Buffer.from(a));}
  assert.equal(out.plan.cut,0);assert.equal(b.length,out.plan.bytes);
});

test('BlockGroups: a Block with no ReferenceBlock is a keyframe, one with a reference is not',async()=>{
  const {bytes,keys,last}=recording({groups:true,clusters:3});
  const ix=feedInChunks(bytes,[333]);
  assert.deepEqual(ix.cues.map(c=>c.time),keys);assert.equal(ix.maxTime,last);
  const r=read((await W.seekable(bytes)).bytes);assert.equal(r.cues.length,3);assert.equal(r.duration,last);
});

test('a file cut off by a crash is kept up to its last complete block, and is still a valid, seekable file',async()=>{
  const {bytes,last}=recording({clusters:4});
  const full=feedInChunks(bytes,[bytes.length]);
  let previous=-1,cuts=0;
  for(let cut=full.clusters[0].data+40;cut<bytes.length;cut+=997){
    const part=bytes.subarray(0,cut),out=await W.seekable(part);
    if(!out){assert.ok(cut<full.clusters[0].data+300,`nothing kept at ${cut}`);continue;}
    const r=read(out.bytes);cuts++;
    assert.ok(out.plan.to<=cut&&cut-out.plan.to<3000,`cut at ${cut}: kept to ${out.plan.to}`);
    assert.ok(r.duration>=previous&&r.duration<=last,`duration ${r.duration} at ${cut}`);previous=r.duration;
    // A cue only for a cluster whose keyframe was written whole, pointing at that cluster.
    assert.ok(r.cues.length<=r.clusters.length);assert.ok(r.cues.every(c=>r.clusters.some(x=>x.start===c.cluster)));
    if(cut>full.clusters[1].at)assert.ok(r.cues.length>=1);
    assert.equal(out.plan.cut,cut-out.plan.to);
  }
  assert.ok(cuts>20);
  // Cut inside the header: nothing to keep (and nothing claimed).
  for(const cut of [10,40,80,150])assert.equal(await W.seekable(bytes.subarray(0,cut)),null);
});

test('large blocks are skipped, never kept: a 6 MB keyframe fed in 64 KB chunks',()=>{
  const {bytes}=recording({clusters:2,videoBytes:6<<20});
  const ix=feedInChunks(bytes,[65536]);
  assert.equal(ix.ok,true);assert.equal(ix.clusters.length,2);assert.equal(ix.complete,bytes.length);
});

test('something that is not a WebM recording is not indexed',async()=>{
  const s=W.scanner();s.feed(Uint8Array.from(Buffer.from('RIFF....WAVEfmt ','latin1')));
  assert.equal(s.index().ok,false);assert.match(s.index().error,/not a WebM/);
  assert.equal(await W.seekable(new Uint8Array(0)),null);
});

test('copy() writes the plan in pieces with each cluster size patched where it falls, whatever the piece size',async()=>{
  const {bytes}=recording({clusters:5});
  const want=(await W.seekable(bytes)).bytes;
  for(const piece of [1,13,4096,1<<20]){
    const s=W.scanner();s.feed(bytes);const p=W.plan(s.index());const parts=[],seen=[];
    const n=await W.copy(p,(at,len)=>bytes.slice(at,at+len),b=>{parts.push(b.slice());},{piece,progress:(d,t)=>seen.push([d,t])});
    assert.deepEqual(Buffer.from(W.concat(parts)),Buffer.from(want),`piece ${piece}`);
    assert.equal(n,want.length);assert.deepEqual(seen.at(-1),[want.length,want.length]);
  }
  await assert.rejects(()=>{const s=W.scanner();s.feed(bytes);return W.copy(W.plan(s.index()),()=>new Uint8Array(0),()=>{});},/could not be read back/);
});

test('sizes and numbers are written as EBML expects',()=>{
  assert.deepEqual([...W.sizeBytes(0)],[0x80]);assert.deepEqual([...W.sizeBytes(126)],[0xfe]);assert.deepEqual([...W.sizeBytes(127)],[0x40,0x7f]);
  assert.deepEqual([...W.sizeBytes(5,8)],[0x01,0,0,0,0,0,0,5]);
  assert.throws(()=>W.sizeBytes(300,1));
  assert.deepEqual([...W.uintBytes(0)],[0]);assert.deepEqual([...W.uintBytes(256)],[1,0]);assert.deepEqual([...W.uintBytes(1,8)],[0,0,0,0,0,0,0,1]);
  assert.deepEqual([...W.idBytes(ID.SEGMENT)],[0x18,0x53,0x80,0x67]);
  const h=W.header(Uint8Array.from([0x1f,0x43,0xb6,0x75,0x01,0xff,0xff,0xff,0xff,0xff,0xff,0xff]),0);
  assert.equal(h.id,ID.CLUSTER);assert.equal(h.size,null);assert.equal(h.len,12);
  assert.equal(W.header(Uint8Array.from([0x1f,0x43]),0),null);
  assert.equal(W.header(Uint8Array.from([0x00,0x80]),0).bad,true);
});

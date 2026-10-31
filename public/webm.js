/* Code Resonance: a live WebM made seekable. The browser's MediaRecorder writes a WebM as it records: its Segment and
 * Clusters have no size, its Info no duration, and there are no Cues, so a player cannot show the length or seek. While
 * a recording is written to disk, scanner() reads the bytes as they are written (element headers only: a block's
 * payload is skipped, never kept) and indexes the clusters, their times and the first video keyframe of each. plan()
 * turns the index into the same file made seekable: the Segment's size, a SeekHead, the Info with its Duration, every
 * cluster's size (patched in place, same width) and Cues at the end. copy() writes it to any sink from any reader, the
 * payload passed through unchanged in large pieces. A file cut off by a crash is indexed up to its last complete block:
 * the plan ends there, so the copy is a valid file of everything recorded until then.
 * Pure JS (Node or a browser worker): no dependency, nothing kept but the index.
 */
'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ResonanceWebm=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
  const ID={EBML:0x1a45dfa3,SEGMENT:0x18538067,SEEKHEAD:0x114d9b74,SEEK:0x4dbb,SEEKID:0x53ab,SEEKPOS:0x53ac,INFO:0x1549a966,SCALE:0x2ad7b1,DURATION:0x4489,
    TRACKS:0x1654ae6b,TRACK:0xae,TRACKNUMBER:0xd7,TRACKTYPE:0x83,VIDEO:0xe0,WIDTH:0xb0,HEIGHT:0xba,CLUSTER:0x1f43b675,TIMECODE:0xe7,SIMPLEBLOCK:0xa3,GROUP:0xa0,BLOCK:0xa1,REFERENCE:0xfb,
    CUES:0x1c53bb6b,CUEPOINT:0xbb,CUETIME:0xb3,CUEPOSITIONS:0xb7,CUETRACK:0xf7,CUECLUSTER:0xf1,VOID:0xec,TAGS:0x1254c367,CHAPTERS:0x1043a770,ATTACHMENTS:0x1941a469};
  // Elements of the Segment's own level: one of them ends a Cluster of unknown size.
  const SEGMENT_LEVEL=new Set([ID.SEEKHEAD,ID.INFO,ID.TRACKS,ID.CLUSTER,ID.CUES,ID.TAGS,ID.CHAPTERS,ID.ATTACHMENTS,ID.EBML]);
  // Elements read whole (header and payload): small by nature; anything larger is not a recorder's file.
  const SMALL=1<<20;
  const EMPTY=new Uint8Array(0);
  // An element header at b[i]: its id (with the length marker, as ids are written), the size (null: unknown) and the
  // header's length; null when the bytes are not there yet; {bad:true} when they cannot be an element header.
  function header(b,i){
    if(i>=b.length)return null;
    const f=b[i];let il=1;for(let m=0x80;il<=4&&!(f&m);m>>=1)il++;
    if(il>4)return {bad:true};
    if(i+il>=b.length)return null;
    let id=0;for(let k=0;k<il;k++)id=id*256+b[i+k];
    const s=b[i+il];let sl=1;for(let m=0x80;sl<=8&&!(s&m);m>>=1)sl++;
    if(sl>8)return {bad:true};
    if(i+il+sl>b.length)return null;
    let v=s&(0xff>>sl),ones=v===(0xff>>sl);
    for(let k=1;k<sl;k++){const x=b[i+il+k];v=v*256+x;if(x!==0xff)ones=false;}
    return {id,idLen:il,sizeLen:sl,size:ones?null:v,len:il+sl};
  }
  const uint=(b,from=0,to=b.length)=>{let v=0;for(let k=from;k<to;k++)v=v*256+b[k];return v;};
  // The children of a small element's payload, as [id, payload] pairs (raw bytes kept for copying).
  function children(b){
    const out=[];let i=0;
    while(i<b.length){const h=header(b,i);if(!h||h.bad||h.size===null||i+h.len+h.size>b.length)break;out.push({id:h.id,raw:b.subarray(i,i+h.len+h.size),data:b.subarray(i+h.len,i+h.len+h.size)});i+=h.len+h.size;}
    return out;
  }
  // A block's track, time (relative to its cluster) and keyframe flag, from the first bytes of its payload.
  function blockHead(p){
    const f=p[0];let l=1;for(let m=0x80;l<=8&&!(f&m);m>>=1)l++;
    if(l>8||p.length<l+3)return null;
    let track=f&(0xff>>l);for(let k=1;k<l;k++)track=track*256+p[k];
    const rel=((p[l]<<8)|p[l+1])<<16>>16;
    return {track,rel,key:!!(p[l+2]&0x80)};
  }

  // ---- The index, built from the bytes as they are written ---------------------------------------------------------
  function scanner(){
    let buf=EMPTY,base=0,skip=0,after=null,want=null,mode='top',cluster=null,group=null,stopped=false;
    const ix={ebml:null,segment:null,info:null,scale:1000000,tracks:null,video:0,width:null,height:null,pre:[],dropped:0,clusters:[],cues:[],maxTime:null,complete:0,first:-1,bytes:0,error:null};
    const stop=why=>{if(!stopped){stopped=true;if(why)ix.error=why;}};
    const consume=n=>{buf=buf.subarray(n);base+=n;};
    const time=(t,track,key)=>{if(ix.maxTime===null||t>ix.maxTime)ix.maxTime=t;if(cluster)cluster.blocks++;
      if(cluster&&!cluster.cued&&key&&track===ix.video){cluster.cued=true;ix.cues.push({time:t,cluster:cluster.at});}};
    const childDone=end=>{if(cluster)cluster.last=end;ix.complete=end;};
    // A block's first bytes are read, the rest skipped; it counts once all of it has been written.
    function block(h,inGroup){
      const at=base,end=at+h.len+h.size,n=Math.min(h.size,11);consume(h.len);
      want={n,then(p){const b=blockHead(p);skip=h.size-n;
        after=()=>{if(!b){if(!inGroup)childDone(end);return;}
          if(inGroup){group.track=b.track;group.rel=b.rel;}else{time(cluster.tc+b.rel,b.track,b.key);childDone(end);}};}};
    }
    function closeCluster(end){if(cluster){cluster.end=end;cluster=null;}mode='segment';}
    function step(){
      if(mode==='segment'&&ix.segment.end!==null&&base>=ix.segment.end){stop();return false;}
      if(mode==='cluster'&&cluster.end!==null&&base>=cluster.end){childDone(cluster.end);ix.complete=cluster.end;closeCluster(cluster.end);return true;}
      if(mode==='group'&&base>=group.end){
        if(group.track!==null){time(cluster.tc+group.rel,group.track,!group.ref);}
        childDone(group.end);group=null;mode='cluster';return true;}
      const h=header(buf,0);
      if(!h)return false;
      if(h.bad){stop(mode==='top'?'not a WebM file':null);return false;}
      const at=base,end=h.size===null?null:at+h.len+h.size;
      if(mode==='top'){
        if(h.id===ID.EBML&&h.size!==null&&h.size<SMALL){want={n:h.len+h.size,then(raw){ix.ebml=raw;}};return true;}
        if(h.id===ID.SEGMENT&&ix.ebml){ix.segment={at,sizeAt:at+h.idLen,sizeLen:h.sizeLen,data:at+h.len,end};consume(h.len);mode='segment';return true;}
        stop('not a WebM file');return false;
      }
      if(mode==='segment'){
        if(h.id===ID.CLUSTER){consume(h.len);cluster={at,sizeAt:at+h.idLen,sizeLen:h.sizeLen,data:at+h.len,end,last:at+h.len,tc:0,cued:false,blocks:0};ix.clusters.push(cluster);if(ix.first<0)ix.first=at;mode='cluster';return true;}
        if(h.size===null){stop();return false;}
        if(h.id===ID.EBML){stop();return false;}
        const done=()=>{ix.complete=end;};
        if((h.id===ID.INFO||h.id===ID.TRACKS)&&h.size<SMALL){want={n:h.len+h.size,then(raw){done();
          const kids=children(raw.subarray(h.len));
          if(h.id===ID.INFO){const s=kids.find(k=>k.id===ID.SCALE);if(s)ix.scale=uint(s.data)||1000000;
            // The Info's own children, without a duration or padding (the plan writes its own duration).
            ix.info=kids.filter(k=>k.id!==ID.DURATION&&k.id!==ID.VOID).map(k=>k.raw);}
          else{ix.tracks=raw;for(const t of kids.filter(k=>k.id===ID.TRACK)){const c=children(t.data),num=c.find(k=>k.id===ID.TRACKNUMBER),type=c.find(k=>k.id===ID.TRACKTYPE);
            if(num&&type&&uint(type.data)===1&&!ix.video){ix.video=uint(num.data);
              const v=children(c.find(k=>k.id===ID.VIDEO)?.data||EMPTY),w=v.find(k=>k.id===ID.WIDTH),hh=v.find(k=>k.id===ID.HEIGHT);
              if(w&&hh){ix.width=uint(w.data);ix.height=uint(hh.data);}}}}}};return true;}
        // A SeekHead, Cues or padding is not copied (the plan writes its own); other elements before the first cluster
        // (tags, chapters) are kept as they are.
        if(ix.first<0&&h.size<SMALL&&h.id!==ID.SEEKHEAD&&h.id!==ID.CUES&&h.id!==ID.VOID){want={n:h.len+h.size,then(raw){done();ix.pre.push(raw);}};return true;}
        consume(h.len);skip=h.size;ix.dropped++;after=done;return true;
      }
      if(mode==='cluster'){
        if(cluster.end===null&&SEGMENT_LEVEL.has(h.id)){closeCluster(at);return true;}
        if(h.size===null||(cluster.end!==null&&end>cluster.end)){stop();return false;}
        if(h.id===ID.TIMECODE&&h.size<=8){want={n:h.len+h.size,then(raw){cluster.tc=uint(raw,h.len);childDone(end);}};return true;}
        if(h.id===ID.SIMPLEBLOCK){block(h,false);return true;}
        if(h.id===ID.GROUP){consume(h.len);group={end,track:null,rel:0,ref:false};mode='group';return true;}
        consume(h.len);skip=h.size;after=()=>childDone(end);return true;
      }
      // Inside a BlockGroup: its Block, and whether it refers to another frame (then it is not a keyframe).
      if(h.size===null||end>group.end){stop();return false;}
      if(h.id===ID.BLOCK){block(h,true);return true;}
      if(h.id===ID.REFERENCE)group.ref=true;
      consume(h.len);skip=h.size;return true;
    }
    function pump(){
      while(!stopped){
        if(skip>0){const n=Math.min(skip,buf.length);consume(n);skip-=n;if(skip>0)return;}
        if(after){const f=after;after=null;f();continue;}
        if(want){if(buf.length<want.n)return;const w=want;want=null;const raw=buf.slice(0,w.n);consume(w.n);w.then(raw);continue;}
        if(!step())return;
      }
    }
    return {
      // The next bytes of the file, in order (any chunking).
      feed(chunk){
        const c=chunk instanceof Uint8Array?chunk:new Uint8Array(chunk);ix.bytes+=c.length;if(stopped)return;
        if(skip>0&&!buf.length){const n=Math.min(skip,c.length);skip-=n;base+=n;buf=n<c.length?c.subarray(n):EMPTY;}
        else if(buf.length){const b=new Uint8Array(buf.length+c.length);b.set(buf);b.set(c,buf.length);buf=b;}
        else buf=c;
        pump();
        // Only an unfinished header or a small element waits here (a block's payload is skipped, never kept): a copy, so
        // the chunk it came from is not held.
        if(buf.length)buf=buf.slice();
      },
      // The index so far: everything up to `complete` is whole elements (what a crash leaves is cut there).
      index(){
        const clusters=[];
        // A cluster counts once one of its blocks was written whole (a crash may leave one with a timecode only).
        for(const c of ix.clusters){const end=c.end!==null&&c.end<=ix.complete?c.end:c.last;if(end>c.data&&c.blocks)clusters.push({at:c.at,sizeAt:c.sizeAt,sizeLen:c.sizeLen,data:c.data,end,tc:c.tc});}
        const keep=new Set(clusters.map(c=>c.at));
        return {ok:!!(ix.ebml&&ix.segment&&ix.info&&ix.tracks&&clusters.length),error:ix.error,bytes:ix.bytes,complete:ix.complete,ebml:ix.ebml,segment:ix.segment,info:ix.info,
          scale:ix.scale,tracks:ix.tracks,video:ix.video,width:ix.width,height:ix.height,pre:ix.pre,dropped:ix.dropped,clusters,cues:ix.cues.filter(c=>keep.has(c.cluster)),maxTime:ix.maxTime};
      }
    };
  }

  // ---- Writing EBML ---------------------------------------------------------------------------------------------
  function concat(parts){let n=0;for(const p of parts)n+=p.length;const out=new Uint8Array(n);let o=0;for(const p of parts){out.set(p,o);o+=p.length;}return out;}
  function idBytes(id){const out=[];for(let v=id;v>0;v=Math.floor(v/256))out.unshift(v%256);return Uint8Array.from(out);}
  // A size as an EBML variable-length integer: `len` bytes, or the fewest that hold it.
  function sizeBytes(n,len=0){
    let l=len||1;if(!len)while(l<8&&n>=2**(7*l)-1)l++;
    if(n>=2**(7*l)-1)throw new Error(`size ${n} does not fit in ${l} bytes`);
    const out=new Uint8Array(l);let v=n;for(let k=l-1;k>0;k--){out[k]=v%256;v=Math.floor(v/256);}out[0]=v|(0x80>>(l-1));return out;
  }
  const fits=(n,len)=>n<2**(7*len)-1;
  function uintBytes(n,len=0){let l=len||1;while(!len&&l<8&&n>=2**(8*l))l++;const out=new Uint8Array(l);let v=n;for(let k=l-1;k>=0;k--){out[k]=v%256;v=Math.floor(v/256);}return out;}
  const element=(id,...payload)=>{const p=concat(payload);return concat([idBytes(id),sizeBytes(p.length),p]);};
  function float64(x){const b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,x,false);return b;}

  // ---- The seekable file --------------------------------------------------------------------------------------------
  // What to write instead of the live file: `head` (EBML header, the Segment with its size, SeekHead, Info with the
  // duration, Tracks), then the input from `from` to `to` (its clusters) with `patches` applied (each cluster's size, at
  // its own offset in the input), then `tail` (the Cues). null when there is nothing to make seekable.
  function plan(ix){
    if(!ix?.ok)return null;
    const from=ix.clusters[0].at,to=ix.clusters[ix.clusters.length-1].end;
    const duration=Math.max(0,ix.maxTime||0);
    const info=element(ID.INFO,...ix.info,element(ID.DURATION,float64(duration)));
    const pre=concat(ix.pre);
    // Positions are 8-byte numbers, so the SeekHead's length does not depend on them.
    const seek=(id,pos)=>element(ID.SEEK,element(ID.SEEKID,idBytes(id)),element(ID.SEEKPOS,uintBytes(pos,8)));
    const seekLen=element(ID.SEEKHEAD,seek(ID.INFO,0),seek(ID.TRACKS,0),seek(ID.CUES,0)).length;
    const infoAt=seekLen,tracksAt=infoAt+info.length,bodyAt=tracksAt+ix.tracks.length+pre.length,cuesAt=bodyAt+(to-from);
    const out=at=>bodyAt+(at-from);
    const cues=element(ID.CUES,...ix.cues.map(c=>element(ID.CUEPOINT,element(ID.CUETIME,uintBytes(c.time)),
      element(ID.CUEPOSITIONS,element(ID.CUETRACK,uintBytes(ix.video)),element(ID.CUECLUSTER,uintBytes(out(c.cluster),8))))));
    const seekHead=element(ID.SEEKHEAD,seek(ID.INFO,infoAt),seek(ID.TRACKS,tracksAt),seek(ID.CUES,cuesAt));
    const segmentSize=cuesAt+cues.length;
    const head=concat([ix.ebml,idBytes(ID.SEGMENT),sizeBytes(segmentSize,8),seekHead,info,ix.tracks,pre]);
    // Each cluster's size, written over its unknown size (the same number of bytes, so nothing moves).
    const patches=[];
    for(const c of ix.clusters){const n=c.end-c.data;if(fits(n,c.sizeLen))patches.push({at:c.sizeAt,bytes:sizeBytes(n,c.sizeLen)});}
    return {head,from,to,patches,tail:cues,bytes:head.length+(to-from)+cues.length,durationMs:duration*ix.scale/1e6,clusters:ix.clusters.length,cues:ix.cues.length,cut:ix.bytes-to};
  }
  // Writes the plan: read(at, n) gives n bytes of the input at `at` (a fresh, writable Uint8Array); write(bytes) takes
  // them in order. Pieces of `piece` bytes; progress(done, total) after each.
  async function copy(p,read,write,{piece=4<<20,progress=null}={}){
    await write(p.head);let done=p.head.length;progress?.(done,p.bytes);
    for(let at=p.from;at<p.to;){
      const n=Math.min(piece,p.to-at),b=await read(at,n);
      if(!b||b.length!==n)throw new Error('the recording could not be read back');
      for(const x of p.patches){const s=Math.max(at,x.at),e=Math.min(at+n,x.at+x.bytes.length);if(s<e)b.set(x.bytes.subarray(s-x.at,e-x.at),s-at);}
      await write(b);at+=n;done+=n;progress?.(done,p.bytes);
    }
    await write(p.tail);done+=p.tail.length;progress?.(done,p.bytes);
    return done;
  }
  // The whole file at once (tests, small files): the seekable bytes, or null.
  async function seekable(bytes){
    const s=scanner();s.feed(bytes);const p=plan(s.index());if(!p)return null;
    const parts=[];await copy(p,(at,n)=>bytes.slice(at,at+n),b=>{parts.push(b.slice());});
    return {bytes:concat(parts),plan:p};
  }
  return {ID,scanner,plan,copy,seekable,header,sizeBytes,uintBytes,idBytes,element,concat};
});

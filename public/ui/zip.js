// A tiny ZIP writer for exports made in the Control Center: stored entries (no compression), CRC-32, UTF-8 names and a
// fixed timestamp, so the same files always give the same bytes. Exactly what receiver/pack-import.js reads back (it
// accepts stored and deflate entries, refuses ZIP64, links and encryption). No DOM: usable from Node for tests.
const TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
export function crc32(bytes){let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=TABLE[(c^bytes[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
// entries: [{name:'folder/file', data:Uint8Array|string}] → Uint8Array of the archive.
export function zipStored(entries){
  const utf8=new TextEncoder(),parts=[],central=[];let offset=0;
  // 1980-01-01 00:00, the first date the format can hold (a DOS date: day 1, month 1, year 0).
  const DATE=(1<<5)|1;
  for(const e of entries){
    const name=utf8.encode(e.name),data=typeof e.data==='string'?utf8.encode(e.data):e.data,crc=crc32(data),size=data.length;
    if(size>0xFFFFFFFE||offset>0xFFFFFFFE)throw new Error('too large for a simple ZIP');
    const local=new DataView(new ArrayBuffer(30));
    local.setUint32(0,0x04034b50,true);local.setUint16(4,20,true);local.setUint16(6,0x800,true);local.setUint16(8,0,true);local.setUint16(10,0,true);local.setUint16(12,DATE,true);
    local.setUint32(14,crc,true);local.setUint32(18,size,true);local.setUint32(22,size,true);local.setUint16(26,name.length,true);local.setUint16(28,0,true);
    const c=new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(10,0,true);c.setUint16(12,0,true);c.setUint16(14,DATE,true);
    c.setUint32(16,crc,true);c.setUint32(20,size,true);c.setUint32(24,size,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);
    parts.push(new Uint8Array(local.buffer),name,data);central.push(new Uint8Array(c.buffer),name);offset+=30+name.length+size;
  }
  const cdSize=central.reduce((n,x)=>n+x.length,0),end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);end.setUint16(8,entries.length,true);end.setUint16(10,entries.length,true);end.setUint32(12,cdSize,true);end.setUint32(16,offset,true);
  const all=[...parts,...central,new Uint8Array(end.buffer)],out=new Uint8Array(all.reduce((n,x)=>n+x.length,0));let p=0;for(const x of all){out.set(x,p);p+=x.length;}
  return out;
}

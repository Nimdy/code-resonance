#!/usr/bin/env node
'use strict';
// Builds the VS Code extension VSIX with Node only (no bash/zip), so packaging works on Windows, Linux and CI alike.
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const ROOT=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'extension','package.json'),'utf8'));
const FILES=['extension.js','outbox.js','filters.js','package.json','README.md'];
const CRC_TABLE=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(buf){if(zlib.crc32)return zlib.crc32(buf);let c=0xffffffff;for(const b of buf)c=CRC_TABLE[(c^b)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
function escapeXml(s){return String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));}
function contentTypes(){
  return `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="vsixmanifest" ContentType="text/xml" />
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/octet-stream" />
  <Default Extension="md" ContentType="text/markdown" />
</Types>
`;
}
function vsixManifest(){
  const engine=escapeXml(manifest.engines.vscode);
  return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Id="${escapeXml(manifest.publisher)}.${escapeXml(manifest.name)}" Version="${escapeXml(manifest.version)}" Language="en-US" Publisher="${escapeXml(manifest.publisher)}" />
    <DisplayName>${escapeXml(manifest.displayName)}</DisplayName>
    <Description xml:space="preserve">${escapeXml(manifest.description)}</Description>
    <Categories>${escapeXml(manifest.categories.join(','))}</Categories>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${engine}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="${escapeXml(manifest.extensionKind.join(','))}" />
    </Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
  </Assets>
</PackageManifest>
`;
}
// Minimal ZIP writer (deflate, no zip64): VSIX payloads here are a few tens of KB.
function zip(entries){
  const locals=[],central=[];let offset=0;
  const dosTime=((12<<11)|(0<<5)|0)&0xffff,dosDate=(((2026-1980)<<9)|(1<<5)|1)&0xffff; // fixed stamp keeps builds reproducible
  for(const {name,data} of entries){
    const nameBuf=Buffer.from(name,'utf8'),deflated=zlib.deflateRawSync(data,{level:9}),crc=crc32(data);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);local.writeUInt16LE(8,8);
    local.writeUInt16LE(dosTime,10);local.writeUInt16LE(dosDate,12);local.writeUInt32LE(crc,14);
    local.writeUInt32LE(deflated.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBuf.length,26);local.writeUInt16LE(0,28);
    const head=Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50,0);head.writeUInt16LE(20,4);head.writeUInt16LE(20,6);head.writeUInt16LE(0x0800,8);head.writeUInt16LE(8,10);
    head.writeUInt16LE(dosTime,12);head.writeUInt16LE(dosDate,14);head.writeUInt32LE(crc,16);head.writeUInt32LE(deflated.length,20);
    head.writeUInt32LE(data.length,24);head.writeUInt16LE(nameBuf.length,28);head.writeUInt32LE(0,38);head.writeUInt32LE(offset,42);
    locals.push(local,nameBuf,deflated);central.push(head,nameBuf);
    offset+=local.length+nameBuf.length+deflated.length;
  }
  const centralBuf=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(centralBuf.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,centralBuf,end]);
}
function build(dest=path.join(ROOT,`code-resonance-${manifest.version}.vsix`)){
  const entries=[
    {name:'[Content_Types].xml',data:Buffer.from(contentTypes())},
    {name:'extension.vsixmanifest',data:Buffer.from(vsixManifest())},
    ...FILES.map(f=>({name:`extension/${f}`,data:fs.readFileSync(path.join(ROOT,'extension',f))}))
  ];
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,zip(entries));
  return dest;
}
if(require.main===module)console.log(`Created ${build(process.argv[2]?path.resolve(process.argv[2]):undefined)}`);
module.exports={build,zip,crc32};

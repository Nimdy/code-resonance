#!/usr/bin/env node
'use strict';
// Builds the VS Code extension VSIX with Node only (no bash/zip, no vsce), so packaging works on Windows, Linux and CI
// alike. The VSIX also carries everything the receiver needs at run time, under extension/runtime/ (the receiver,
// engine, sdk, the player and Control Center, the vendored three.js and TypeScript, the hook adapters, the pack schema
// and templates, the documents the Control Center serves), laid out as in this repository, so the extension can start
// the receiver itself (extension/receiver-host.js). Nothing from tests/ or qualification/. The manifest carries what
// the Visual Studio Marketplace and Open VSX read (icon, links, tags, branding, licence, changelog); see
// docs/PUBLISHING.md.
//   node scripts/package-vsix.js [out.vsix]
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const ROOT=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'extension','package.json'),'utf8'));
// The extension itself (its install folder's top level).
const FILES=['extension.js','outbox.js','filters.js','proof.js','receiver-host.js','agent-hooks.js','launcher.js','package.json','README.md','icon.png'];
// The receiver's run-time tree, copied to extension/runtime/<same path>: [folder, which files, include subfolders].
const RUNTIME_DIRS=[
  ['receiver',/\.js$/,false],['engine',/\.js$/,true],['sdk',/\.js$/,false],['public',/./,true],['vendor',/\.(?:js|txt)$/,false],
  ['scripts/hooks',/\.js$/,false],['packs/schema',/\.json$/,true],['packs/template',/./,true],['docs',/\.md$/,false],['docs/packs',/\.md$/,false]
];
// Single files of the tree. The receiver requires ../package.json (its version), ../extension/package.json (the settings
// it lists), ../extension/proof.js and ../extension/filters.js (shared with the extension), and serves SECURITY.md.
const RUNTIME_FILES=['package.json','SECURITY.md','extension/package.json','extension/proof.js','extension/filters.js'];
const REPOSITORY=String(manifest.repository?.url||'').replace(/\.git$/,'');
const GITHUB=/^https:\/\/github\.com\/([^/]+\/[^/]+)$/.exec(REPOSITORY);
const BLOB=`${REPOSITORY}/blob/main`,RAW=GITHUB?`https://raw.githubusercontent.com/${GITHUB[1]}/main`:BLOB;
const MIME={vsixmanifest:'text/xml',xml:'text/xml',json:'application/json',js:'application/javascript',md:'text/markdown',txt:'text/plain',
  png:'image/png',jpg:'image/jpeg',css:'text/css',html:'text/html',svg:'image/svg+xml'};
const CRC_TABLE=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(buf){if(zlib.crc32)return zlib.crc32(buf);let c=0xffffffff;for(const b of buf)c=CRC_TABLE[(c^b)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
function escapeXml(s){return String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));}
// Markdown shown on the Marketplace and Open VSX pages: a relative link (from `fromDir` of this repository) becomes a link
// to the file on GitHub, a relative image its raw URL, as vsce does. Absolute links and #anchors stay.
function absoluteLinks(md,fromDir){
  return md.replace(/(!?)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?((?:\s+"[^"]*")?)\s*\)/g,(m,bang,text,target,title)=>{
    if(/^[a-z][a-z0-9+.-]*:/i.test(target)||target.startsWith('#'))return m;
    const [file,anchor]=target.split('#'),rel=path.posix.normalize(path.posix.join(fromDir,file));
    return `${bang}[${text}](${bang?`${RAW}/${rel}`:`${BLOB}/${rel}${anchor?`#${anchor}`:''}`}${title})`;
  });
}
const markdown=(file,fromDir)=>Buffer.from(absoluteLinks(fs.readFileSync(path.join(ROOT,file),'utf8'),fromDir));
function walk(dir,match,deep,out=[]){
  for(const e of fs.readdirSync(path.join(ROOT,dir),{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
    if(e.name.startsWith('.')||e.name==='node_modules')continue;
    const rel=`${dir}/${e.name}`;
    if(e.isDirectory()){if(deep)walk(rel,match,deep,out);}else if(e.isFile()&&match.test(e.name))out.push(rel);
  }
  return out;
}
// Every file of the VSIX after the two package parts: [name in the archive, contents].
function files(){
  const out=[
    ...FILES.map(f=>[`extension/${f}`,fs.readFileSync(path.join(ROOT,'extension',f))]),
    // The repository's licence travels with the extension, where VS Code shows it; the changelog and third-party notices
    // with their links made absolute, for the Marketplace's tabs.
    ['extension/LICENSE.txt',fs.readFileSync(path.join(ROOT,'LICENSE'))],
    ['extension/CHANGELOG.md',markdown('CHANGELOG.md','')],
    ['extension/THIRD_PARTY_NOTICES.md',markdown('THIRD_PARTY_NOTICES.md','')]
  ];
  const runtime=[...new Set([...RUNTIME_FILES,...RUNTIME_DIRS.flatMap(([dir,match,deep])=>walk(dir,match,deep))])].sort();
  for(const f of runtime)out.push([`extension/runtime/${f}`,fs.readFileSync(path.join(ROOT,f))]);
  for(const [name] of out)if(!path.posix.extname(name))throw new Error(`${name} has no file extension: the package's content types are declared per extension`);
  return out;
}
function contentTypes(names){
  const exts=[...new Set(['vsixmanifest',...names.map(n=>path.posix.extname(n).slice(1).toLowerCase())])].sort();
  return `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
${exts.map(e=>`  <Default Extension="${escapeXml(e)}" ContentType="${MIME[e]||'application/octet-stream'}" />`).join('\n')}
</Types>
`;
}
// The VSIX manifest (vsx-schema 2011), with the properties and assets vsce writes for the same package.json.
function vsixManifest(){
  const m=manifest,prop=(id,value)=>`      <Property Id="${id}" Value="${escapeXml(value)}" />`;
  const bugs=typeof m.bugs==='string'?m.bugs:m.bugs?.url;
  const properties=[
    prop('Microsoft.VisualStudio.Code.Engine',m.engines.vscode),
    prop('Microsoft.VisualStudio.Code.ExtensionDependencies',(m.extensionDependencies||[]).join(',')),
    prop('Microsoft.VisualStudio.Code.ExtensionPack',(m.extensionPack||[]).join(',')),
    prop('Microsoft.VisualStudio.Code.ExtensionKind',m.extensionKind.join(',')),
    prop('Microsoft.VisualStudio.Code.LocalizedLanguages',''),
    prop('Microsoft.VisualStudio.Code.ExecutesCode','true'),
    ...(REPOSITORY?[prop('Microsoft.VisualStudio.Services.Links.Source',m.repository.url),prop('Microsoft.VisualStudio.Services.Links.Getstarted',m.repository.url),
      prop(GITHUB?'Microsoft.VisualStudio.Services.Links.GitHub':'Microsoft.VisualStudio.Services.Links.Repository',m.repository.url)]:[]),
    ...(bugs?[prop('Microsoft.VisualStudio.Services.Links.Support',bugs)]:[]),
    ...(m.homepage?[prop('Microsoft.VisualStudio.Services.Links.Learn',m.homepage)]:[]),
    ...(m.galleryBanner?.color?[prop('Microsoft.VisualStudio.Services.Branding.Color',m.galleryBanner.color)]:[]),
    ...(m.galleryBanner?.theme?[prop('Microsoft.VisualStudio.Services.Branding.Theme',m.galleryBanner.theme)]:[]),
    prop('Microsoft.VisualStudio.Services.GitHubFlavoredMarkdown','true'),
    prop('Microsoft.VisualStudio.Services.Content.Pricing','Free')
  ];
  const assets=[['Microsoft.VisualStudio.Code.Manifest','extension/package.json'],['Microsoft.VisualStudio.Services.Content.Details','extension/README.md'],
    ['Microsoft.VisualStudio.Services.Content.Changelog','extension/CHANGELOG.md'],['Microsoft.VisualStudio.Services.Content.License','extension/LICENSE.txt'],
    ['Microsoft.VisualStudio.Services.Icons.Default',`extension/${m.icon}`]];
  return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${escapeXml(m.name)}" Version="${escapeXml(m.version)}" Publisher="${escapeXml(m.publisher)}" />
    <DisplayName>${escapeXml(m.displayName)}</DisplayName>
    <Description xml:space="preserve">${escapeXml(m.description)}</Description>
    <Tags>${escapeXml([...new Set(m.keywords||[])].join(','))}</Tags>
    <Categories>${escapeXml(m.categories.join(','))}</Categories>
    <GalleryFlags>${m.preview?'Public Preview':'Public'}</GalleryFlags>
    <Properties>
${properties.join('\n')}
    </Properties>
    <License>extension/LICENSE.txt</License>
    <Icon>extension/${escapeXml(m.icon)}</Icon>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation>
  <Dependencies />
  <Assets>
${assets.map(([type,p])=>`    <Asset Type="${type}" Path="${escapeXml(p)}" Addressable="true" />`).join('\n')}
  </Assets>
</PackageManifest>
`;
}
// Minimal ZIP writer (deflate, no zip64): well under 4 GB and 65,535 entries.
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
  if(entries.length>0xffff||offset>0xffffffff)throw new Error('The VSIX needs ZIP64, which this writer does not produce');
  const centralBuf=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(centralBuf.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,centralBuf,end]);
}
function build(dest=path.join(ROOT,`code-resonance-${manifest.version}.vsix`)){
  const payload=files().map(([name,data])=>({name,data}));
  const entries=[
    {name:'[Content_Types].xml',data:Buffer.from(contentTypes(payload.map(e=>e.name)))},
    {name:'extension.vsixmanifest',data:Buffer.from(vsixManifest())},
    ...payload
  ];
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,zip(entries));
  return dest;
}
if(require.main===module){
  const dest=build(process.argv[2]?path.resolve(process.argv[2]):undefined);
  const n=files().length+2,size=fs.statSync(dest).size;
  console.log(`Created ${dest} (${n} files, ${(size/1024/1024).toFixed(2)} MB)`);
}
module.exports={build,zip,crc32,files,contentTypes,vsixManifest,absoluteLinks};

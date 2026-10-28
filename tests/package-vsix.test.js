'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {build,crc32}=require('../scripts/package-vsix');
function readZip(buf){
  const end=buf.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));assert(end>=0,'end of central directory present');
  const count=buf.readUInt16LE(end+10);let at=buf.readUInt32LE(end+16);const files=new Map();
  for(let i=0;i<count;i++){
    assert.equal(buf.readUInt32LE(at),0x02014b50);
    const method=buf.readUInt16LE(at+10),crc=buf.readUInt32LE(at+16),size=buf.readUInt32LE(at+20),nameLen=buf.readUInt16LE(at+28),extra=buf.readUInt16LE(at+30),comment=buf.readUInt16LE(at+32),local=buf.readUInt32LE(at+42);
    const name=buf.subarray(at+46,at+46+nameLen).toString('utf8');
    const dataAt=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28);
    const data=method===8?zlib.inflateRawSync(buf.subarray(dataAt,dataAt+size)):buf.subarray(dataAt,dataAt+size);
    assert.equal(crc32(data),crc,`CRC matches for ${name}`);
    files.set(name,data);at+=46+nameLen+extra+comment;
  }
  return files;
}
test('VSIX packager needs only Node and produces a valid, versioned extension archive',()=>{
  const dest=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cr-vsix-')),'out.vsix');
  try{
    build(dest);
    const files=readZip(fs.readFileSync(dest));
    for(const f of ['[Content_Types].xml','extension.vsixmanifest','extension/package.json','extension/extension.js','extension/outbox.js','extension/filters.js','extension/README.md','extension/LICENSE.txt'])assert(files.has(f),f);
    const pkg=JSON.parse(files.get('extension/package.json'));
    const manifest=files.get('extension.vsixmanifest').toString();
    assert.equal(pkg.license,'MIT');
    assert.deepEqual(files.get('extension/LICENSE.txt'),fs.readFileSync(path.join(__dirname,'../LICENSE')));
    assert.match(manifest,/<License>extension\/LICENSE\.txt<\/License>/);
    assert.match(manifest,new RegExp(`Version="${pkg.version.replace(/\./g,'\\.')}"`));
    assert.match(manifest,new RegExp(`Id="${pkg.publisher}\\.${pkg.name}"`));
    assert.deepEqual(files.get('extension/extension.js'),fs.readFileSync(path.join(__dirname,'../extension/extension.js')));
  }finally{fs.rmSync(path.dirname(dest),{recursive:true,force:true});}
});

'use strict';
// The VSIX (scripts/package-vsix.js): a valid archive written by Node alone, the extension plus the receiver's run-time
// tree and nothing from tests or qualification, a manifest with what the Marketplace and Open VSX read, every require
// resolving inside the package, and the receiver actually starting from the unpacked package.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib'),net=require('node:net');
const {build,crc32,absoluteLinks}=require('../scripts/package-vsix');
const host=require('../extension/receiver-host');
const ROOT=path.join(__dirname,'..');
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
    assert(!files.has(name),`${name} once`);
    files.set(name,data);at+=46+nameLen+extra+comment;
  }
  return files;
}
// One build for the whole file, unpacked once.
let built=null;
function vsix(t){
  if(!built){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cr-vsix-')),dest=path.join(dir,'out.vsix');
    build(dest);const buf=fs.readFileSync(dest),files=readZip(buf);
    for(const [name,data] of files){const f=path.join(dir,'unpacked',...name.split('/'));fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data);}
    built={dir,size:buf.length,files,unpacked:path.join(dir,'unpacked')};
    process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));
  }
  return built;
}
const runtimeNames=files=>[...files.keys()].filter(n=>n.startsWith('extension/runtime/')).map(n=>n.slice('extension/runtime/'.length));
test('VSIX packager needs only Node and produces a valid, versioned extension archive',t=>{
  const {files}=vsix(t);
  for(const f of ['[Content_Types].xml','extension.vsixmanifest','extension/package.json','extension/extension.js','extension/outbox.js','extension/filters.js','extension/proof.js',
    'extension/receiver-host.js','extension/agent-hooks.js','extension/launcher.js','extension/README.md','extension/LICENSE.txt','extension/CHANGELOG.md',
    'extension/THIRD_PARTY_NOTICES.md','extension/icon.png'])assert(files.has(f),f);
  const pkg=JSON.parse(files.get('extension/package.json'));
  const manifest=files.get('extension.vsixmanifest').toString();
  assert.equal(pkg.license,'MIT');
  assert.deepEqual(files.get('extension/LICENSE.txt'),fs.readFileSync(path.join(ROOT,'LICENSE')));
  assert.match(manifest,/<License>extension\/LICENSE\.txt<\/License>/);
  // vsce's identity: the extension's name as Id, its publisher apart (the Marketplace id is publisher.name).
  assert.match(manifest,new RegExp(`<Identity Language="en-US" Id="${pkg.name}" Version="${pkg.version.replace(/\./g,'\\.')}" Publisher="${pkg.publisher}" />`));
  assert.equal(`${pkg.publisher}.${pkg.name}`,'zerobandwidth.code-resonance');
  for(const f of ['extension.js','outbox.js','receiver-host.js','agent-hooks.js','launcher.js','icon.png'])assert.deepEqual(files.get(`extension/${f}`),fs.readFileSync(path.join(ROOT,'extension',f)),f);
  assert.equal(pkg.version,require('../package.json').version,'the receiver it carries reports the extension\'s version');
});
test('The VSIX carries the receiver\'s run-time tree and nothing from tests, qualification or the media',t=>{
  const {files,size}=vsix(t),names=runtimeNames(files);
  for(const f of ['package.json','receiver/server.js','receiver/proof.js','engine/worker.js','engine/reducer.js','engine/languages/typescript.js','sdk/project-id.js',
    'vendor/typescript.js','vendor/TYPESCRIPT-LICENSE.txt','public/index.html','public/app.js','public/ui/main.js','public/vendor/three.module.min.js','public/vendor/THREE-LICENSE.txt',
    'public/worlds/stellar.js','scripts/hooks/claude-code.js','scripts/hooks/install-codex.js','packs/schema/pack.schema.json','packs/template/world/world.js',
    'SECURITY.md','extension/package.json','extension/proof.js','extension/filters.js'])assert(names.includes(f),f);
  for(const n of names)assert(!/^(tests|qualification|packs\/(examples|testing)|docs\/(media|worlds|history|desktop|construct|control-center))\//.test(n)&&!/node_modules/.test(n),n);
  assert(names.every(n=>!n.startsWith('scripts/')||n.startsWith('scripts/hooks/')),'only the hook adapters of scripts/');
  // Each runtime file is the repository's, byte for byte.
  for(const n of names)assert.deepEqual(files.get(`extension/runtime/${n}`),fs.readFileSync(path.join(ROOT,n)),n);
  // Every document the receiver serves (its fixed list) is there.
  const server=fs.readFileSync(path.join(ROOT,'receiver','server.js'),'utf8'),list=server.slice(server.indexOf('const DOCS='),server.indexOf(';',server.indexOf('const DOCS=')));
  for(const [,doc] of list.matchAll(/'([\w./-]+\.md)'/g))assert(names.includes(doc==='SECURITY.md'?doc:`docs/${doc}`),doc);
  assert(size<6*1024*1024,`${(size/1024/1024).toFixed(2)} MB`);
  assert(files.size<400,`${files.size} files`);
  t.diagnostic(`VSIX: ${files.size} files, ${(size/1024/1024).toFixed(2)} MB`);
});
test('Every file\'s extension has a content type; the manifest names the icon, links, tags, banner, changelog and licence',t=>{
  const {files}=vsix(t),types=files.get('[Content_Types].xml').toString(),manifest=files.get('extension.vsixmanifest').toString();
  const declared=new Set([...types.matchAll(/<Default Extension="([^"]+)"/g)].map(m=>m[1]));
  for(const name of files.keys())if(name!=='[Content_Types].xml'){const ext=path.posix.extname(name).slice(1).toLowerCase();assert(ext&&declared.has(ext),name);}
  assert.match(types,/Extension="png" ContentType="image\/png"/);assert.match(types,/Extension="js" ContentType="application\/javascript"/);
  const pkg=JSON.parse(files.get('extension/package.json'));
  assert.match(manifest,/<Icon>extension\/icon\.png<\/Icon>/);
  assert.match(manifest,new RegExp(`<Tags>${pkg.keywords.join(',')}</Tags>`));
  assert.match(manifest,/<GalleryFlags>Public Preview<\/GalleryFlags>/);
  for(const [id,value] of [['Links.Source',pkg.repository.url],['Links.GitHub',pkg.repository.url],['Links.Support',pkg.bugs.url],['Links.Learn',pkg.homepage],
    ['Branding.Color',pkg.galleryBanner.color],['Branding.Theme','dark'],['GitHubFlavoredMarkdown','true'],['Content.Pricing','Free']])
    assert(manifest.includes(`<Property Id="Microsoft.VisualStudio.Services.${id}" Value="${value}" />`),id);
  assert.match(manifest,/<Property Id="Microsoft.VisualStudio.Code.ExecutesCode" Value="true" \/>/);
  // Every asset the manifest names is in the package.
  const assets=[...manifest.matchAll(/<Asset Type="([^"]+)" Path="([^"]+)"/g)].map(m=>[m[1],m[2]]);
  assert.deepEqual(assets.map(a=>a[0]).sort(),['Microsoft.VisualStudio.Code.Manifest','Microsoft.VisualStudio.Services.Content.Changelog','Microsoft.VisualStudio.Services.Content.Details',
    'Microsoft.VisualStudio.Services.Content.License','Microsoft.VisualStudio.Services.Icons.Default']);
  for(const [,p] of assets)assert(files.has(p),p);
  // The icon: a 128×128 PNG.
  const png=files.get('extension/icon.png');
  assert.deepEqual(png.subarray(0,8),Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));assert.equal(png.toString('latin1',12,16),'IHDR');
  assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[128,128]);
});
test('Marketplace pages: every link and image in the README and changelog is absolute; images are HTTPS raster files',t=>{
  const {files}=vsix(t);
  for(const f of ['extension/README.md','extension/CHANGELOG.md','extension/THIRD_PARTY_NOTICES.md']){
    const md=files.get(f).toString().replace(/^```[\s\S]*?^```/gm,'');
    for(const [,bang,target] of md.matchAll(/(!?)\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)){
      assert(/^(https?:|mailto:|#|vscode:)/.test(target),`${f}: ${target}`);
      if(bang)assert(/^https:\/\/.+\.(png|jpe?g|gif|webp)$/i.test(target),`${f}: image ${target}`);
    }
  }
  assert.equal(absoluteLinks('[a](docs/WSL.md#where) ![b](docs/media/x.jpg) [c](https://x.y) [d](#here)','')
    ,'[a](https://github.com/Nimdy/code-resonance/blob/main/docs/WSL.md#where) ![b](https://raw.githubusercontent.com/Nimdy/code-resonance/main/docs/media/x.jpg) [c](https://x.y) [d](#here)');
});
test('Every require in the package resolves inside the package',t=>{
  const {files,unpacked}=vsix(t);
  const node=[...files.keys()].filter(n=>n.endsWith('.js')&&n.startsWith('extension/')&&!n.startsWith('extension/runtime/public/'));
  const missing=[];
  for(const name of node){
    const file=path.join(unpacked,...name.split('/'));
    for(const [,spec] of fs.readFileSync(file,'utf8').matchAll(/require\((['"])(\.{1,2}\/[^'"]+)\1\)/g).map(m=>[m[0],m[2]])){
      const base=path.resolve(path.dirname(file),spec);
      if(![base,`${base}.js`,`${base}.json`,path.join(base,'index.js')].some(c=>fs.existsSync(c)&&fs.statSync(c).isFile()))missing.push(`${name}: ${spec}`);
    }
  }
  assert.deepEqual(missing,[]);
  // The receiver's worker and the language analysers it loads by path.
  assert(files.has('extension/runtime/engine/worker.js'));
});
test('The receiver starts from the unpacked VSIX alone and serves the player, the Control Center and its documents',async t=>{
  const {unpacked}=vsix(t),ext=path.join(unpacked,'extension');
  const runtime=host.findRuntime(ext);
  assert.deepEqual(runtime,{root:path.join(ext,'runtime'),kind:'bundled'});
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'cr-vsix-data-'));
  const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port));});s.on('error',reject);});
  t.after(async()=>{await host.stopReceiver({port,dir:data}).catch(()=>{});const s=host.readState(data);if(s&&host.alive(s.pid))try{process.kill(s.pid,'SIGKILL');}catch{}
    fs.rmSync(data,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
  const r=await host.ensureReceiver({port,dir:data,runtime,launcher:path.join(ext,'launcher.js'),version:require('../extension/package.json').version});
  assert.equal(r.status,'started',JSON.stringify(r));
  assert.equal(r.state.runtime,runtime.root);
  for(const route of ['/','/health','/app.js','/ui/main.js','/worlds/stellar.js','/vendor/three.module.min.js','/docs/FIRST-RUN.md','/docs/SECURITY.md','/docs/packs/README.md','/api/packs/templates','/api/catalog','/api/integrations'])
    assert.equal((await fetch(`http://127.0.0.1:${port}${route}`)).status,200,route);
  assert.equal((await (await fetch(`http://127.0.0.1:${port}/health`)).json()).version,require('../extension/package.json').version);
  // The hook adapters were copied from the package to the stable path.
  assert(fs.existsSync(path.join(data,'hooks','scripts','hooks','claude-code.js')));
  assert.equal((await host.stopReceiver({port,dir:data})).status,'stopped');
});

'use strict';
// The extension identifies a project as sha256(workspaceFolder.uri.toString()). Agent hooks and CLIs run outside
// VS Code, so they rebuild that exact string: vscode.Uri.file(fsPath).toString() (vs/base/common/uri.ts).
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const RESERVED=/[!'()*]/g; // encodeURIComponent leaves these alone; VS Code escapes them
function encodeSegment(segment){return encodeURIComponent(segment).replace(RESERVED,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());}
function vscodeFileUri(fsPath,platform=process.platform){
  let p=platform==='win32'?String(fsPath).replace(/\\/g,'/'):String(fsPath);
  let authority='';
  if(p.startsWith('//')){const end=p.indexOf('/',2);authority=end<0?p.slice(2):p.slice(2,end);p=end<0?'/':p.slice(end);}
  if(!p.startsWith('/'))p='/'+p;
  // Windows drive letters are lower-cased and the colon is escaped: file:///c%3A/Users/...
  const drive=/^\/([A-Za-z]):(.*)$/.exec(p);
  let encoded;
  if(drive)encoded=`/${drive[1].toLowerCase()}%3A`+drive[2].split('/').map(encodeSegment).join('/');
  else encoded=p.split('/').map(encodeSegment).join('/');
  return `file://${authority?encodeURIComponent(authority.toLowerCase()):''}${encoded}`;
}
function projectIdForRoot(root,platform=process.platform){return crypto.createHash('sha256').update(vscodeFileUri(root,platform)).digest('hex');}
// Agents usually run in the repository root or a subdirectory; the VS Code workspace folder is normally the repo root.
function findProjectRoot(start){
  if(process.env.RESONANCE_PROJECT_ROOT)return path.resolve(process.env.RESONANCE_PROJECT_ROOT);
  let dir=path.resolve(start);
  for(;;){if(fs.existsSync(path.join(dir,'.git')))return dir;const up=path.dirname(dir);if(up===dir)return path.resolve(start);dir=up;}
}
module.exports={vscodeFileUri,projectIdForRoot,findProjectRoot};

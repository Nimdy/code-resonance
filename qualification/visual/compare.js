'use strict';
// Composes a labelled comparison sheet from rendered frames (the frames themselves are the real renderer's output).
// node visual/compare.js --out results/visual/three-projects.jpg "<label>=<frame.jpg>" ...
const cp=require('node:child_process');
const ffmpeg=require('ffmpeg-static');
const fs=require('node:fs');
const FONT=['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'].find(f=>fs.existsSync(f));
const args=process.argv.slice(2);const outIndex=args.indexOf('--out');const out=args[outIndex+1];
const cols=Number(args.includes('--cols')?args[args.indexOf('--cols')+1]:2);
const panels=args.filter((a,i)=>i!==outIndex&&i!==outIndex+1&&a!=='--cols'&&args[i-1]!=='--cols').map(a=>{const k=a.indexOf('=');return {label:a.slice(0,k),file:a.slice(k+1)};});
if(!out||!panels.length)throw new Error('usage: compare.js --out sheet.jpg "label=frame.jpg" ...');
const esc=s=>s.replace(/\\/g,'\\\\').replace(/:/g,'\\:').replace(/'/g,"\\\\'");
const inputs=panels.flatMap(p=>['-i',p.file]);
const scaled=panels.map((p,i)=>`[${i}:v]scale=960:540,drawbox=y=ih-46:w=iw:h=46:color=black@0.55:t=fill,drawtext=fontfile=${FONT}:text='${esc(p.label)}':fontcolor=white:fontsize=21:x=18:y=h-33[p${i}]`);
const rows=[];for(let r=0;r*cols<panels.length;r++){const idx=panels.map((_,i)=>i).slice(r*cols,r*cols+cols);while(idx.length<cols)idx.push(null);
  rows.push(idx.map(i=>i===null?'[blank]':`[p${i}]`).join('')+`hstack=inputs=${cols}[r${r}]`);}
const blank=panels.length%cols?[`color=black:s=960x540:d=1[blank]`]:[];
const filter=[...scaled,...blank,...rows,rows.length>1?rows.map((_,r)=>`[r${r}]`).join('')+`vstack=inputs=${rows.length}`:'[r0]null'].join(';');
cp.execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y',...inputs,'-filter_complex',filter,'-frames:v','1','-q:v','3',out],{stdio:'inherit'});
console.log(out);

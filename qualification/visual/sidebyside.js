'use strict';
// Two films of the same performance side by side (each scaled to 1280x720, labelled), with the left film's sound: a
// before/after comparison where the only difference is what the labels name (the frames are the real renderer's).
// node visual/sidebyside.js --left a.webm --right b.webm --left-label "Before" --right-label "After" --out ab.webm
const cp=require('node:child_process');
const fs=require('node:fs');
const ffmpeg=require('ffmpeg-static');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const FONT=['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'].find(f=>fs.existsSync(f));
const left=arg('left'),right=arg('right'),out=arg('out');
if(!left||!right||!out)throw new Error('usage: sidebyside.js --left a.webm --right b.webm [--left-label L] [--right-label R] --out ab.webm');
// ffmpeg's filter quoting cannot carry a straight apostrophe or a colon inside drawtext: labels use safe characters.
const safe=s=>String(s).replace(/'/g,'’').replace(/:/g,' ·');
const label=(s,i)=>FONT?`,drawtext=fontfile=${FONT}:text='${safe(s)}':x=28:y=24:fontsize=26:fontcolor=white@0.9:box=1:boxcolor=black@0.45:boxborderw=10[v${i}]`:`[v${i}]`;
const graph=`[0:v]scale=1280:720${label(arg('left-label','Before'),0)};[1:v]scale=1280:720${label(arg('right-label','After'),1)};[v0][v1]hstack=inputs=2[v]`;
cp.execFileSync(ffmpeg,['-y','-loglevel','error','-i',left,'-i',right,'-filter_complex',graph,'-map','[v]','-map','0:a?','-c:v','libvpx-vp9','-b:v','8M','-deadline','good','-cpu-used','4','-row-mt','1',
  '-pix_fmt','yuv420p','-c:a','libopus','-b:a','160k','-shortest',out],{stdio:'inherit'});
console.log(`side by side ${out} (${(fs.statSync(out).size/1e6).toFixed(1)} MB)`);

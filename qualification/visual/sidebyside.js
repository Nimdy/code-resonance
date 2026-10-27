'use strict';
// Two or three films of the same performance side by side, labelled, with one film's sound: a comparison where the only
// difference is what the labels name (the frames are the real renderer's).
// node visual/sidebyside.js --left a.webm --right b.webm --left-label "Before" --right-label "After" --out ab.webm
//   two films, each scaled to 1280x720, side by side, with the left film's sound (as before).
// node visual/sidebyside.js --inputs a.webm,b.webm,c.webm --labels "Influence 0|Musical (1)|Expressive (2)"
//        [--layout grid|row] [--title "Same moment, same framing"] [--audio 1] --out abc.webm
//   three films (the Phase 11 comparisons: music influence 0 / 1 / 2, or the Clean / Cinematic / Dreamlike finishes):
//   grid (default) is a 2x2 of 960x540 cells in a 1920x1080 frame, the fourth cell carrying the title; row is an hstack
//   of three 1280x720 films (3840x720). --audio picks whose sound is kept (1-based, default the first).
// --dry-run prints the ffmpeg arguments instead of running ffmpeg.
const cp=require('node:child_process');
const fs=require('node:fs');
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i<0?d:process.argv[i+1];};
const FONT=['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'].find(f=>fs.existsSync(f));
// ffmpeg's filter quoting cannot carry a straight apostrophe, a colon, a backslash or a percent sign (drawtext expands
// it) inside drawtext: labels use safe characters.
const safe=s=>String(s).replace(/\\/g,'').replace(/'/g,'’').replace(/:/g,' ·').replace(/%/g,'％');
const label=(s,out,size=26)=>FONT&&s?`,drawtext=fontfile=${FONT}:text='${safe(s)}':x=28:y=24:fontsize=${size}:fontcolor=white@0.9:box=1:boxcolor=black@0.45:boxborderw=10[${out}]`:`[${out}]`;
const encode=['-c:v','libvpx-vp9','-b:v','8M','-deadline','good','-cpu-used','4','-row-mt','1','-pix_fmt','yuv420p','-c:a','libopus','-b:a','160k','-shortest'];
function plan(){
  const out=arg('out');
  if(arg('inputs')){
    const inputs=arg('inputs').split(',').map(s=>s.trim()).filter(Boolean),labels=String(arg('labels','')).split('|'),layout=arg('layout','grid'),audio=Number(arg('audio',1))-1;
    if(inputs.length!==3||!out)throw new Error('usage: sidebyside.js --inputs a.webm,b.webm,c.webm [--labels "A|B|C"] [--layout grid|row] [--title T] [--audio 1..3] --out abc.webm');
    if(!['grid','row'].includes(layout))throw new Error('--layout is grid or row');
    if(!Number.isInteger(audio)||audio<0||audio>2)throw new Error('--audio is 1, 2 or 3');
    const files=inputs.flatMap(f=>['-i',f]);
    if(layout==='row'){
      const graph=`${inputs.map((_,i)=>`[${i}:v]scale=1280:720${label(labels[i]||`Film ${i+1}`,`v${i}`)}`).join(';')};[v0][v1][v2]hstack=inputs=3[v]`;
      return {out,args:['-y','-loglevel','error',...files,'-filter_complex',graph,'-map','[v]','-map',`${audio}:a?`,...encode,out]};
    }
    // The fourth cell: the page's darkest background, named by the comparison's title.
    const title=arg('title','');
    const cell=`color=c=0x05070b:s=960x540:r=30${FONT&&title?`,drawtext=fontfile=${FONT}:text='${safe(title)}':x=(w-text_w)/2:y=(h-text_h)/2:fontsize=30:fontcolor=white@0.85`:''}[v3]`;
    const graph=`${inputs.map((_,i)=>`[${i}:v]scale=960:540${label(labels[i]||`Film ${i+1}`,`v${i}`,22)}`).join(';')};${cell};[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0:shortest=1[v]`;
    return {out,args:['-y','-loglevel','error',...files,'-filter_complex',graph,'-map','[v]','-map',`${audio}:a?`,...encode,out]};
  }
  const left=arg('left'),right=arg('right');
  if(!left||!right||!out)throw new Error('usage: sidebyside.js --left a.webm --right b.webm [--left-label L] [--right-label R] --out ab.webm  (or --inputs a,b,c for three)');
  const graph=`[0:v]scale=1280:720${label(arg('left-label','Before'),'v0')};[1:v]scale=1280:720${label(arg('right-label','After'),'v1')};[v0][v1]hstack=inputs=2[v]`;
  return {out,args:['-y','-loglevel','error','-i',left,'-i',right,'-filter_complex',graph,'-map','[v]','-map','0:a?',...encode,out]};
}
const {out,args}=plan();
if(process.argv.includes('--dry-run')){console.log(JSON.stringify(args,null,1));process.exit(0);}
cp.execFileSync(require('ffmpeg-static'),args,{stdio:'inherit'});
console.log(`side by side ${out} (${(fs.statSync(out).size/1e6).toFixed(1)} MB)`);

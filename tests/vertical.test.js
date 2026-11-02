'use strict';
// Vertical clips (9:16): the portrait rules for words (sized by the short side, inside the safe area Reels and
// Shorts leave clear), the clip's window (centred on the highlight's key moment), npm run film -- --vertical, and the
// landscape rules left exactly as they were.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sha}=require('../receiver/protocol');
const highlight=require('../engine/highlight');
const film=require('../scripts/film');
const {tempDir}=require('./helpers');
const labels=()=>import('../public/worlds/labels.js');
const T0=1750000000000;

// ---- Words in a portrait frame ---------------------------------------------------------------------------------------
test('words are sized by the short side: w/1920 in landscape (as before), PORTRAIT_TEXT at 1080 wide in a portrait',async()=>{
  const {textScale,PORTRAIT_TEXT,isPortrait}=await labels();
  assert.equal(textScale(1920,1080),1);assert.equal(textScale(1280,720),1280/1920);assert.equal(textScale(1000,1000),1000/1920);
  assert.equal(textScale(1080,1920),PORTRAIT_TEXT);assert.equal(textScale(540,960),PORTRAIT_TEXT/2);
  assert(PORTRAIT_TEXT>1,'a phone needs words larger than a monitor does');
  assert.equal(isPortrait(1080,1920),true);assert.equal(isPortrait(1920,1080),false);assert.equal(isPortrait(1000,1000),false);
});
test('the safe area: the whole frame in landscape; in a portrait, under the top 12 %, above the bottom 20 %, inside the side margins',async()=>{
  const {safeArea,PORTRAIT_SAFE}=await labels();
  assert.deepEqual(safeArea(1920,1080),{x0:0,y0:0,x1:1920,y1:1080});
  const s=safeArea(1080,1920);
  assert.equal(s.y0,1920*.12);assert.equal(s.y1,1920*.8);assert.equal(s.x0,1080*.06);assert.equal(s.x1,1080*.9);
  assert.deepEqual({...PORTRAIT_SAFE},{top:.12,bottom:.2,left:.06,right:.1});
});
test('a portrait frame keeps its title, caption and banner inside the safe area, at any portrait size',async()=>{
  const {labelBox,safeArea,portraitPlaces}=await labels();
  for(const [w,h] of [[1080,1920],[540,960],[720,1280]]){
    const s=safeArea(w,h),P=portraitPlaces(w,h);
    for(const it of [{kind:'title',text:'Lumen Recipes',sub:'Stellar Forge · a generative world from this project\'s code'},{kind:'caption',text:'Tests fail · a stellar storm over 3 worlds'},
      {kind:'banner',text:'First validation · Integration validated · Recovery',sub:'milestone · verified by a passing test run'},{kind:'lower-third',text:'Lumen Recipes · Stellar Forge'}]){
      const b=labelBox(it,w,h);
      assert(b.x0>=s.x0-1e-9&&b.x1<=s.x1+1e-9&&b.y0>=s.y0-1e-9&&b.y1<=s.y1+1e-9,`${w}x${h} ${it.kind} ${JSON.stringify(b)} outside ${JSON.stringify(s)}`);
    }
    assert(P.title.y<P.caption.y&&P.title.sub<P.caption.y,'the caption stands under the title card, not over it');
  }
});
// The same fixture in a landscape frame gives exactly what 0.7.2 gave (the digest of 0.7.2's labels.js on it).
function fixture(m,size,mode,pts,t){
  const world={
    describe:c=>({text:c.tier>=3?'Recovered · 3 worlds calm again':'A new star ignites',sub:'subsystem',banner:c.tier>=3?'Integration validated':null,bannerSub:'verified',position:{x:c.tier,y:0,z:0},color:'#9dffcf'}),
    agentPosition:()=>({x:0,y:0,z:0}),agentColor:()=>'#fff',subsystemLabels:()=>[{position:{x:1,y:0,z:0},text:'Vauos',sub:'logic'},{position:{x:2,y:0,z:0},text:'Kelor',sub:'interface'}],status:()=>'2 validated',inspect:()=>({position:{x:3,y:0,z:0},text:'Vauos',sub:'logic'})
  };
  const recipe={family:'stellar-forge',familyName:'Stellar Forge',title:'Night Build',genome:{limits:{maxLabels:5}}};
  const toScreen=p=>{const q=pts[(p.x|0)%pts.length];return {x:q[0]*size[0]/1920,y:q[1]*size[1]/1080,visible:true};};
  return m.composeLabels({mode,recipe,info:{t,phase:'active',agents:[{id:'a',number:1,provider:'claude-code',label:'editing',busy:true,alpha:1,arrived:T0,since:100,display:'tool'},{id:'b',number:2,provider:'codex',label:'reading',busy:false,alpha:.8,arrived:T0+1000,since:500,display:'unknown'}]},
    commands:[{at:T0+1500,tier:3,subject:{fileId:'f1'}},{at:T0+1800,tier:2,subject:{groupId:'g1'}},{at:T0+1900,tier:2,subject:{groupId:'g2'}}],
    agentName:a=>a.number===1?'Claude':'Codex',world,toScreen,size,origin:T0,selected:'x'});
}
test('landscape (and square) frames place every word exactly as 0.7.2 did',async()=>{
  const m=await labels(),out=[];
  for(const size of [[1920,1080],[1280,720],[1600,1000],[1000,1000]])for(const mode of m.LABEL_MODES)for(const pts of [[[600,400],[620,420],[900,300],[1500,800]],[[30,30],[1880,1050],[100,900],[960,540]]])
    for(const t of [T0+2000,T0+5000,T0+12000]){const items=fixture(m,size,mode,pts,t);out.push(items,items.map(it=>m.labelBox(it,size[0],size[1])));}
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(out)).digest('hex'),'6c82ff0fbb24dcc52e8dd52155b7a5bcb1a4d8d1d7f2efa673a062668bacd137');
});
test('in a portrait frame every callout, chip, label, caption and banner stays inside the safe area, without overlaps between callouts',async()=>{
  const m=await labels();
  for(const [w,h] of [[1080,1920],[540,960]])for(const mode of ['cinematic','explorer','stream'])
    for(const pts of [[[600,400],[620,420],[900,300],[1500,800]],[[30,30],[1880,1050],[100,900],[960,540]],[[960,240],[960,300],[960,1000],[960,560]]])
      for(const t of [T0+2000,T0+5000,T0+12000]){
        const s=m.safeArea(w,h),items=fixture(m,[w,h],mode,pts,t);
        const boxes=items.map(it=>[it,m.labelBox(it,w,h)]).filter(([,b])=>b);
        for(const [it,b] of boxes)assert(b.x0>=s.x0-1e-6&&b.x1<=s.x1+1e-6&&b.y0>=s.y0-1e-6&&b.y1<=s.y1+1e-6,`${w}x${h} ${mode} ${it.kind} "${it.text}" ${JSON.stringify(b)}`);
        const callouts=boxes.filter(([it])=>it.kind==='callout').map(([,b])=>b);
        for(let i=0;i<callouts.length;i++)for(let j=i+1;j<callouts.length;j++){const a=callouts[i],b=callouts[j];assert(!(a.x0<b.x1&&b.x0<a.x1&&a.y0<b.y1&&b.y0<a.y1),'callouts overlap');}
      }
});
test('a portrait callout stands over its point, or under it when there is no room above, centred where it can be',async()=>{
  const {portraitCallout,portraitPlaces}=await labels();
  const P=portraitPlaces(1080,1920);
  const mid=portraitCallout({x:540,y:900},'A new star ignites','subsystem',P);
  assert(mid.dy<0&&mid.ty<900,'above the point');assert(Math.abs(mid.tx+Math.min(P.maxW,18*9.2*P.k)/2-540)<1,'centred over it');
  const high=portraitCallout({x:540,y:P.safe.y0+20},'A new star ignites','subsystem',P);
  assert(high.dy>0&&high.ty>P.safe.y0+20,'under a point at the top of the safe area');
  const edge=portraitCallout({x:1070,y:900},'Recovered · 3 worlds calm again','the tests pass again',P);
  assert(edge.tx>=P.safe.x0&&edge.tx+Math.min(P.maxW,31*9.2*P.k)<=P.safe.x1+1e-9,'kept inside the safe area near the edge');
});

// ---- The clip's window ------------------------------------------------------------------------------------------------
const I=(ts,type,tier=2,extra={})=>({id:`${type}-${ts}`,ts,type,tier,...extra});
test('a clip is --duration seconds of film at the highlight\'s speed, centred on its recovery',()=>{
  const intents=[I(T0+20_000,'subsystem.created'),I(T0+60_000,'validation.failed'),I(T0+100_000,'validation.recovered',3),I(T0+100_000,'milestone.achieved',3),I(T0+200_000,'repository.checkpoint')];
  const picked={from:T0,to:T0+360_000,speed:4};
  const c=highlight.clip(intents,picked,{seconds:30,start:T0,end:T0+360_000});
  assert.equal(c.to-c.from,30*1000*4);assert.equal(c.seconds,30);assert.equal(c.speed,4);
  assert.equal(c.keyType,'validation.recovered');assert.equal(c.key,T0+100_000);
  assert.equal((c.from+c.to)/2,T0+100_000,'centred on the key moment');
});
test('a clip near an end of the recording keeps its length and shifts inside it; a short recording gives all of it',()=>{
  const picked={from:T0,to:T0+360_000,speed:4};
  const early=highlight.clip([I(T0+10_000,'milestone.achieved',3)],picked,{seconds:30});
  assert.deepEqual([early.from,early.to],[T0,T0+120_000]);
  const late=highlight.clip([I(T0+355_000,'agent.collision',1)],picked,{seconds:30});
  assert.deepEqual([late.from,late.to],[T0+240_000,T0+360_000]);
  const short=highlight.clip([I(T0+30_000,'milestone.achieved',3)],{from:T0,to:T0+60_000,speed:4},{seconds:30,start:T0,end:T0+60_000});
  assert.deepEqual([short.from,short.to],[T0,T0+60_000]);assert.equal(short.seconds,15);
  // Centred on the key moment even where that reaches outside the highlight's window, inside the recording.
  const wide=highlight.clip([I(T0+400_000,'milestone.achieved',3)],{from:T0+380_000,to:T0+440_000,speed:4},{seconds:30,start:T0,end:T0+900_000});
  assert.deepEqual([wide.from,wide.to],[T0+340_000,T0+460_000]);
  const failure=highlight.clip([I(T0+400_000,'validation.failed'),I(T0+420_000,'validation.recovered',3)],{from:T0+400_000,to:T0+760_000,speed:4},{seconds:30,start:T0,end:T0+900_000});
  assert.deepEqual([failure.from,failure.to],[T0+360_000,T0+480_000]);
});
test('the key moment is the one whose clip scores highest, then the more telling kind, then the earliest; else the window\'s middle',()=>{
  const picked={from:T0,to:T0+1_200_000,speed:4};
  // A lone checkpoint early; a failure, its recovery and a milestone together later: the later clip scores more.
  const intents=[I(T0+50_000,'repository.checkpoint'),I(T0+700_000,'validation.failed'),I(T0+720_000,'validation.recovered',3),I(T0+721_000,'milestone.achieved',3)];
  const c=highlight.clip(intents,picked,{seconds:30});
  assert.equal(c.keyType,'validation.recovered');assert(c.from<=T0+700_000&&c.to>=T0+721_000);
  // Same score: the recovery outranks the milestone at the same moment.
  const tie=highlight.clip([I(T0+100_000,'milestone.achieved',3),I(T0+100_000,'validation.recovered',3)],picked,{seconds:30});
  assert.equal(tie.keyType,'validation.recovered');
  const none=highlight.clip([I(T0+5_000,'editor.change.observed',0)],picked,{seconds:30});
  assert.equal(none.keyType,null);assert.equal(none.key,T0+600_000);assert.equal((none.from+none.to)/2,T0+600_000);
  assert.equal(highlight.clip([],null),null);assert.equal(highlight.clip([],picked,{seconds:0}),null);
});

// ---- npm run film -- --vertical ---------------------------------------------------------------------------------------
const CLUSTER=[I(T0+60_000,'validation.failed'),I(T0+100_000,'validation.recovered',3),I(T0+100_000,'milestone.achieved',3),I(T0+300_000,'structure.created')];
function plant(t,title='Night Build'){
  const dir=tempDir(t,'cr-vertical-');const projectId=sha('vertical-wrap');const pdir=path.join(dir,'projects',sha(projectId));
  fs.mkdirSync(pdir,{recursive:true});fs.writeFileSync(path.join(pdir,'id'),projectId);
  fs.writeFileSync(path.join(pdir,'recipe.json'),JSON.stringify({title,aliases:{}}));
  fs.writeFileSync(path.join(pdir,'performance.jsonl'),JSON.stringify({seq:0,start:T0,end:T0+1_200_000,intents:CLUSTER})+'\n');
  return {dir,projectId};
}
const tools=(calls,logs)=>({exists:p=>/playwright-core$|ffmpeg-static$/.test(p),probe:()=>false,spawn:(cmd,args)=>{calls.push(args);return 0;},log:s=>logs.push(String(s)),err:s=>logs.push(String(s))});
const val=(args,k)=>args[args.indexOf(k)+1];
test('npm run film -- --vertical renders 1080 × 1920, 30 s around the key moment, with the end card and the music faded, to an MP4 named vertical',async t=>{
  const {dir,projectId}=plant(t);
  for(const argv of [['--vertical'],['--aspect','9:16']]){
    const calls=[],logs=[];
    assert.equal(await film.main(['--data',dir,'--project',projectId,...argv],tools(calls,logs)),0,logs.join('\n'));
    const a=calls[0];
    assert.equal(val(a,'--width'),'1080');assert.equal(val(a,'--height'),'1920');
    assert.equal(Number(val(a,'--to'))-Number(val(a,'--from')),30*1000*Number(val(a,'--speed')));
    assert.equal((Number(val(a,'--from'))+Number(val(a,'--to')))/2,T0+100_000,'centred on the recovery');
    assert.equal(val(a,'--end-card'),'3');assert(a.includes('--title-card'));assert(Number(val(a,'--fade-in'))>0&&Number(val(a,'--fade-out'))>0);
    assert.equal(val(a,'--out'),film.VERTICAL_OUT.mp4);assert.match(path.basename(val(a,'--out')),/vertical\.mp4$/);
    assert(a.includes('--copy'));
  }
  const calls=[];
  await film.main(['--data',dir,'--project',projectId,'--vertical','--duration','12','--format','webm','--size','540x960'],tools(calls,[]));
  assert.equal(Number(val(calls[0],'--to'))-Number(val(calls[0],'--from')),12*1000*4);
  assert.equal(val(calls[0],'--out'),film.VERTICAL_OUT.webm);assert.equal(val(calls[0],'--width'),'540');assert.equal(val(calls[0],'--height'),'960');
});
test('a landscape film keeps exactly its arguments; vertical options are refused without --vertical; bad shapes are refused',async t=>{
  const {dir,projectId}=plant(t);
  const calls=[];await film.main(['--data',dir,'--project',projectId],tools(calls,[]));
  const a=calls[0];
  for(const k of ['--width','--height','--title-card','--end-card','--fade-in','--fade-out','--world','--family'])assert(!a.includes(k),k);
  assert.equal(val(a,'--out'),film.DEFAULT_OUT);
  assert.deepEqual(a.slice(1),['--data',path.resolve(dir),'--project',projectId,'--copy','--labels','cinematic','--speed','4','--from',val(a,'--from'),'--to',val(a,'--to'),'--out',film.DEFAULT_OUT]);
  for(const [argv,msg] of [[['--aspect','4:3'],film.ASPECT_MSG],[['--duration','20'],/vertical/],[['--vertical','--duration','1'],/seconds/],[['--vertical','--size','1920x1080'],/portrait/],
    [['--vertical','--format','mov'],/mp4 or webm/],[['--vertical','--out','clip.webm','--format','mp4'],/\.mp4/],[['--vertical','--aspect','16:9'],/9:16/],[['--world','moon'],/living, construct or city/]]){
    const logs=[],c=[];const code=await film.main(['--data',dir,'--project',projectId,...argv],tools(c,logs));
    assert.equal(code,1,argv.join(' '));assert.equal(c.length,0);
    if(msg instanceof RegExp)assert.match(logs.join('\n'),msg,argv.join(' '));else assert.equal(logs.join('\n'),msg);
  }
});
test('a vertical clip needs a public title, as the film does; its end card draws only the approved title',async t=>{
  const {dir,projectId}=plant(t,null);
  const logs=[],calls=[];
  assert.equal(await film.main(['--data',dir,'--project',projectId,'--vertical'],tools(calls,logs)),1);
  assert.match(logs.join('\n'),/no public title/i);assert.equal(calls.length,0);
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const card=app.slice(app.indexOf('function drawEndCard'),app.indexOf('function onPackFrame'));
  assert.match(card,/r\?\.title/);assert.match(card,/CODE RESONANCE/);
  assert(!/\.name\b|project\b|selected/.test(card.replace(/projectId/g,'')),'no project name, path or id reaches the end card');
});
test('the film renderer encodes H.264 and AAC in MP4 for an .mp4 file, and its WebM command is unchanged',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','qualification','visual','film.js'),'utf8');
  assert.match(src,/'-c:v','libx264'/);assert.match(src,/'-c:a','aac'/);assert.match(src,/'\+faststart'/);
  assert.match(src,/\['-c:v','libvpx-vp9','-b:v','6M','-deadline','good','-cpu-used','4','-row-mt','1','-pix_fmt','yuv420p','-c:a','libopus','-b:a','160k'\]/);
  assert.match(src,/afade=t=in/);assert.match(src,/afade=t=out/);
});
test('worlds that do not frame portraits themselves keep their field of view across a portrait frame\'s width',async()=>{
  const {portraitGoal}=await import('../public/worlds/host.js');
  const goal={target:{x:0,y:0,z:0},distance:10,azimuth:0,elevation:.3,fov:34};
  assert.equal(portraitGoal(goal,16/9),goal);assert.equal(portraitGoal(goal,1),goal);
  const p=portraitGoal(goal,9/16),half=x=>Math.tan(x*Math.PI/360);
  assert(Math.abs(half(p.fov)*9/16-half(34))<1e-9,'the width sees what the landscape height saw');
  assert.equal(p.distance,10);assert.equal(portraitGoal({...goal,fov:undefined},9/16).fov,portraitGoal({...goal,fov:36},9/16).fov);
  for(const f of ['stellar','cathedral']){const src=fs.readFileSync(path.join(__dirname,'..','public','worlds',`${f}.js`),'utf8');assert.match(src,/framesPortrait:true/,f);}
  // Fractal Biosphere composes a portrait as a square frame and lets the host widen the view (its camera then stays in
  // front of the giant far organisms).
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'..','public','worlds','biosphere.js'),'utf8'),/framesPortrait/);
});
test('the recorder and the Control Center offer Vertical 1080 × 1920, and the receiver saves it as a profile',()=>{
  const root=path.join(__dirname,'..');
  assert.match(fs.readFileSync(path.join(root,'public','app.js'),'utf8'),/vertical:\[1080,1920\]/);
  assert.match(fs.readFileSync(path.join(root,'receiver','store.js'),'utf8'),/'vertical'/);
  const out=fs.readFileSync(path.join(root,'public','ui','workspaces','output.js'),'utf8');
  assert.match(out,/id:'vertical'.*size:\[1080,1920\]/);assert.match(out,/--vertical`/);
});

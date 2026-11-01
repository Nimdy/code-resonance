// Aurora (preview): a polar night over a frozen lake, the software as the aurora. Design brief: docs/worlds/aurora.md.
//
// Data -> image (nothing here is decoration that claims engineering work):
//  - subsystem (district) -> a curtain of the aurora: a folded sheet of light hanging along the magnetic field, its own
//                            hue on the identity's harmony (green to teal at its foot, violet to magenta at its fringe),
//                            layered in depth across the sky by its order of birth; its length grows with its files
//  - file (module)        -> a ray in its curtain at its slot; the ray's height follows its live symbols; a new file
//                            ignites its ray (a pulse runs up it), a removed one fades
//  - dependency           -> a field line: a faint arc of light from the importing ray up along the field and down into
//                            the imported one (between curtains); pulses run along it when the importer's file fires
//  - agent                -> a wisp in its provider's colour and shape (CAST seat): waiting, it hovers low over the ice;
//                            at work it flies up to the ray it edits and its touch ignites the ray; between curtains a
//                            field line joins it travels along it. A subagent is a smaller wisp tethered to its parent
//  - tests passing        -> pulsating patches sweeping the covered curtain
//  - failure              -> the covered curtain turns storm-red and ragged, and stays so while its files are stressed.
//                            Never gold
//  - recovery             -> the sky gathers into a corona overhead (rays converging at the magnetic zenith), then settles
//  - commit               -> a meteor, and the cabin's window flares
//  - verified milestone   -> a lantern on the shore (lasting); the earned auroral breakup (the whole sky erupts into a
//                            corona storm) at most once per BREAKUP_GAP of performance time and only with the director's
//                            milestone token; otherwise a glow on its curtain
// Ambient life (never progress): the curtains drift and fold, the stars wheel about the pole, an occasional meteor, the
// ice's reflection moves gently, the camera breathes. With the host's musical clock the curtains ripple on the bars,
// their rays shimmer on the eighths the arrangement plays, and a section's onset is a surge along every curtain.
// Every image is a function of the model (in a replay its whole recorded history: onHistory), the recipe, the
// director's fold and the performance clock.
import {THREE,clamp,lerp,smooth,hash,rand} from './core.js';
import {MAG,ALT,layoutConfig,prepare,historyFrom,recordCue,curtainsAt,curtainPoint,fieldLine,mountainLayers,shoreOf,landHeight,lanternAt,
  meteorOf,idleMeteors,breakupAllowed,SHORE_Z} from './aurora-layout.js';
import {CURTAIN_VS,CURTAIN_FS,SKY_FS,STAR_VS,STAR_FS,ICE_VS,ICE_FS,LAND_VS,LAND_FS,MTN_VS,MTN_FS,TREE_VS,TREE_FS,CABIN_VS,CABIN_FS,POINT_VS,POINT_FS,RIB_VS,RIB_FS} from './aurora-glsl.js';
import {touchesAt,touchGain} from './touch.js';
import {presence} from '../providers.js';
const TAU=Math.PI*2,MAXC=48,RAYW=512,MAX_FX=4000,MAX_RIB=3000,MAX_ARCS=32,DWELL=4500,TRAVEL=1800,TRAVEL_MAX=4500,FLY_V=520;
// Each CAST provider its own colour and shape (seat: Claude, Cursor, Codex, Grok, Qwen, Kimi, then unknown providers).
const AGENT_COLORS=['#ff5f8a','#3fe6ff','#8dff6a','#f2f4ff','#59a8ff','#ff5cf0','#ffb35c','#c0c8d8'];
// Quality levels (the host also drops MSAA at 1 and resolution at 2 and 3): the curtains' columns (shared by all of them)
// and rows, the reflection's resolution (a divisor of the frame's) and its blur taps, the stars. Films render at 0.
export const QUALITY=[{cols:1920,rows:10,refl:3,stars:2800},{cols:1664,rows:9,refl:3,stars:2400},{cols:1408,rows:8,refl:4,stars:2000},{cols:1152,rows:6,refl:5,stars:1400}];
// The harmony's shares of its span: curtain k takes the hue at SEQ[k] of the span around the identity's first hue, kept
// within the greens and teals an aurora's foot can be (and its fringe within violet to magenta).
const SEQ=[0,1,-1,.5,-.5,.75,-.75,.25,-.25,.9,-.9];
const SPAN={analogous:9,complementary:13,split:16,triad:18};
// The breakup's and the corona's spans (view seconds).
const CORONA_S=11,BREAKUP_S=16;
export function createFamily(ctx){
  const {scene,camera,model,recipe,renderer}=ctx;const G=recipe.genome||{},P0=G.palette||{};
  const num=(v,d)=>typeof v==='number'&&Number.isFinite(v)?v:d;
  const au=G.aurora||{},sk=G.sky||{},lk=G.lake||{},ld=G.land||{},mot=G.motion||{},cam=G.camera||{},LT=G.light||{},MU=G.music||{};
  const col=(c,d)=>new THREE.Color(typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)?c:d);
  const pal={primary:col(P0.primary,'#2fe08a'),secondary:col(P0.secondary,'#b04ad8'),accent:col(P0.accent,'#ffb050'),highlight:col(P0.highlight,'#d8e4f4'),
    deep:col(P0.deep,'#02040a'),haze:col(P0.haze,'#0d1626'),warning:col(P0.warning,'#ff2f4a'),valid:col(P0.valid,'#8ef0d8')};
  // The night stays a night whatever a tuned palette says.
  const capL=(c,max)=>{const h={};c.getHSL(h);if(h.l>max)c.setHSL(h.h,h.s,max);return c;};capL(pal.deep,.03);capL(pal.haze,.14);
  const seed=(recipe.projectSeed>>>0)||1,cfg=layoutConfig(recipe);
  const V3=(c,k=1)=>new THREE.Vector3(c.r*k,c.g*k,c.b*k);
  const agentCol=AGENT_COLORS.map(c=>new THREE.Color(c));
  const disposables=[];const keep=x=>{disposables.push(x);return x;};
  const add=(o,order=0,mirror=true)=>{o.frustumCulled=false;o.renderOrder=order;scene.add(o);if(mirror){const m=o.isPoints?new THREE.Points(o.geometry,o.material):new THREE.Mesh(o.geometry,o.material);m.frustumCulled=false;m.renderOrder=order;mirrorScene.add(m);o.userData.mirror=m;}return o;};
  // ---- The recorded history: a replay's own model of everything recorded up to the moment (onHistory); live, the host's
  let hist=null;const M=()=>hist||model;
  // ---- The harmony: each curtain its own hue around the identity's first hue (a believable aurora: its foot green to
  // teal, its fringe violet to magenta) ---------------------------------------------------------------------------------
  const hp={},hf={};pal.primary.getHSL(hp,THREE.SRGBColorSpace);pal.secondary.getHSL(hf,THREE.SRGBColorSpace);
  const span=SPAN[P0.scheme]||24,lowCols=new Map(),hiCols=new Map();
  function curtainColor(id,rank){let c=lowCols.get(id);if(c)return c;
    let h=hp.h*360+span*SEQ[rank%SEQ.length]*(rank>=SEQ.length?.6:1)+(rand(hash(`hue/${id}`))-.5)*6;h=clamp(h,116,168);
    const k=new THREE.Color().setHSL(h/360,clamp(hp.s*(.9+.18*rand(hash(`sat/${id}`))),.5,.95),clamp(hp.l,.45,.6),THREE.SRGBColorSpace);
    lowCols.set(id,c=[k.r,k.g,k.b]);return c;}
  function fringeColor(id,rank){let c=hiCols.get(id);if(c)return c;
    let h=hf.h*360-span*.8*SEQ[rank%SEQ.length]+(rand(hash(`fhue/${id}`))-.5)*10;h=clamp(h<120?h+360:h,262,334);
    const k=new THREE.Color().setHSL((h%360)/360,clamp(hf.s,.55,.9),clamp(hf.l,.48,.62),THREE.SRGBColorSpace);
    hiCols.set(id,c=[k.r,k.g,k.b]);return c;}
  // ---- Textures: noise, striation (the rays), the curtains' parameters and their rays --------------------------------
  const noiseTex=keep((()=>{const N=256,r=rngOf(hash(`noise/${seed}`)),a=new Float32Array(N*N*4);for(let i=0;i<a.length;i++)a[i]=r();
    for(let pass=0;pass<3;pass++){const b=new Float32Array(a.length);for(let y=0;y<N;y++)for(let x=0;x<N;x++)for(let c=0;c<4;c++){let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=a[(((y+dy+N)%N)*N+((x+dx+N)%N))*4+c];b[(y*N+x)*4+c]=sum/9;}a.set(b);}
    const d=new Uint8Array(N*N*4);for(let c=0;c<4;c++){let lo=1,hi=0;for(let i=c;i<a.length;i+=4){lo=Math.min(lo,a[i]);hi=Math.max(hi,a[i]);}for(let i=c;i<a.length;i+=4)d[i]=Math.round((a[i]-lo)/(hi-lo||1)*255);}
    const t=new THREE.DataTexture(d,N,N,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;})());
  // The rays' striation: discrete rays of varied width and strength across 2048 texels (four sets: fine, finer and
  // faster, broad bands, and a smooth one for the ragged lower edge), wrapping.
  const striTex=keep((()=>{const N=2048,d=new Uint8Array(N*4),r=rngOf(hash(`stri/${seed}`));
    // r: fine rays; g: finer, sampled at its own scale (it drifts the other way); b: broad bands; a: the edge's raggedness
    const sets=[[44,6,20],[34,4,12],[11,48,150],[0,0,0]];
    for(let c=0;c<4;c++){const a=new Float32Array(N);
      if(c===3){const p1=r()*TAU,p2=r()*TAU;for(let i=0;i<N;i++)a[i]=.5+.3*Math.sin(i/N*TAU*4+p1)+.2*Math.sin(i/N*TAU*14+p2);}
      else{const [n,w0,w1]=sets[c];for(let k=0;k<n*2;k++){const p=r()*N,w=w0+(w1-w0)*r()**1.5,h=.35+.65*r()**.7;for(let i=-Math.ceil(w*3);i<=Math.ceil(w*3);i++){const j=((Math.floor(p)+i)%N+N)%N;a[j]+=h*Math.exp(-((i/w)**2));}}
        for(let i=0;i<N;i++)a[i]+=.08;}
      let mx=0;for(const v of a)mx=Math.max(mx,v);for(let i=0;i<N;i++)d[i*4+c]=Math.round(clamp(a[i]/(mx*(c===3?1:.8)))*255);}
    const t=new THREE.DataTexture(d,N,1,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=t.minFilter=THREE.LinearFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;})());
  const cpData=new Float32Array(8*(MAXC+1)*4),cpTex=keep(new THREE.DataTexture(cpData,8,MAXC+1,THREE.RGBAFormat,THREE.FloatType));cpTex.magFilter=cpTex.minFilter=THREE.NearestFilter;cpTex.needsUpdate=true;
  const rayA=new Uint8Array(RAYW*(MAXC+1)*4),rayB=new Uint8Array(RAYW*(MAXC+1)*4);
  const rayTexA=keep(new THREE.DataTexture(rayA,RAYW,MAXC+1,THREE.RGBAFormat)),rayTexB=keep(new THREE.DataTexture(rayB,RAYW,MAXC+1,THREE.RGBAFormat));
  for(const t of [rayTexA,rayTexB]){t.magFilter=t.minFilter=THREE.LinearFilter;t.generateMipmaps=false;t.needsUpdate=true;}
  const rayF=new Float32Array(RAYW*8),flashV=new Float32Array(RAYW),flashH=new Float32Array(RAYW);
  // ---- Uniforms (one mirror switch for every material: -1 while the reflection is drawn) -------------------------------
  const mir={value:1},v4=()=>new THREE.Vector4(),arr=(n,f)=>Array.from({length:n},f);
  const U={uMirror:mir,uV:{value:0},uQ:{value:0},uPx:{value:1},uRes:{value:new THREE.Vector2(1920,1080)},uNoise:{value:noiseTex},
    uA:{value:new THREE.Vector3(60,24,6)},uRip:{value:arr(4,v4)},uMag:{value:new THREE.Vector3(...MAG)},uCP:{value:cpTex},uNK:{value:MAXC+1},
    uRay:{value:rayTexA},uRayB:{value:rayTexB},uStri:{value:striTex},uFast:{value:0},uRayK:{value:clamp(num(au.rays,1),.3,1.6)*.8},uFringeK:{value:clamp(num(au.fringe,.9),0,1.6)},
    uEdgeK:{value:clamp(num(au.edge,1),.4,1.6)},uEighth:{value:0},uStormK:{value:1},uSurge:{value:new THREE.Vector2()},uWarn:{value:V3(pal.warning,1)},uValid:{value:V3(pal.valid,1)},
    uWhite:{value:new THREE.Vector3(.85,1,.95)},uFlash:{value:0},uE:{value:arr(8,v4)},uEF:{value:arr(8,v4)},uNE:{value:0},
    uSnowC:{value:V3(new THREE.Color('#dfe8f4').lerp(pal.highlight,.3),1)},uSkyAmb:{value:new THREE.Vector3(.01,.014,.03)},uAurL:{value:new THREE.Vector3(.01,.03,.02)},
    uAurD:{value:new THREE.Vector3(0,.4,-1).normalize()},uAcc:{value:V3(pal.accent,1)},uGlow:{value:arr(10,v4)},uNG:{value:0},uFrost:{value:0},uHazeC:{value:new THREE.Vector3()},uTree:{value:0},
    uIce:{value:V3(pal.deep.clone().lerp(new THREE.Color('#0a1a2a'),.5),.6)},uGloss:{value:clamp(num(lk.gloss,.8),0,1)},uSnow:{value:clamp(num(lk.snow,.7),0,1.6)},uCracks:{value:clamp(num(lk.cracks,.8),0,1.6)},
    uRefl:{value:null},uWin:{value:1}};
  const mat=(vertexShader,fragmentShader,o={})=>keep(new THREE.ShaderMaterial({uniforms:U,vertexShader,fragmentShader,side:THREE.DoubleSide,...o}));
  const glowMat=(vs,fs)=>mat(vs,fs,{transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending});
  // ---- The reflection: the night mirrored in the ice, drawn before the frame (background()) ------------------------------
  const mirrorScene=new THREE.Scene();
  const reflRT=keep(new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType,depthBuffer:true,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter}));U.uRefl.value=reflRT.texture;
  // ---- The sky ----------------------------------------------------------------------------------------------------------
  // The celestial pole: north (away from the shore), 68 degrees up; the stars and the Milky Way turn about it.
  const POLE=new THREE.Vector3(0,Math.sin(68*Math.PI/180),-Math.cos(68*Math.PI/180));
  const galaxy=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(1.05+.4*rand(seed+5),rand(seed+6)*TAU,.3*rand(seed+7)));
  const skyRot=new THREE.Matrix3(),skyRotT=new THREE.Matrix3(),tmpM=new THREE.Matrix4();
  const skyU={uInv:{value:new THREE.Matrix4()},uCam:{value:new THREE.Vector3()},uV:U.uV,uQ:U.uQ,uMir:mir,uMW:{value:clamp(num(sk.milkyWay,.8),0,1.6)},uAG:{value:clamp(num(sk.airglow,.5),0,1.6)},
    uNL:{value:0},uDeep:{value:V3(pal.deep,4.5)},uHaze:{value:V3(pal.haze,1.1)},uAirG:{value:new THREE.Vector3(.004,.012,.006)},uAirR:{value:new THREE.Vector3(.008,.002,.003)},
    uRot:{value:skyRot},uLobe:{value:arr(8,v4)},uLobeC:{value:arr(8,v4)},uNoise:{value:noiseTex}};
  const sky=keep(new THREE.ShaderMaterial({uniforms:skyU,depthWrite:false,depthTest:false,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:SKY_FS}));
  {const q=new THREE.Mesh(keep(new THREE.PlaneGeometry(2,2)),sky);q.frustumCulled=false;q.renderOrder=-100;mirrorScene.add(q);}
  // stars: magnitudes on a power law, colours from warm to blue-white, on the celestial sphere
  const starGeo=keep(new THREE.BufferGeometry());{const n=QUALITY[0].stars,pos=new Float32Array(n*3),at=new Float32Array(n*4),r=rngOf(hash(`stars/${seed}`));
    for(let i=0;i<n;i++){const z=r()*2-1,a=r()*TAU,s=Math.sqrt(1-z*z);pos[i*3]=s*Math.cos(a);pos[i*3+1]=z;pos[i*3+2]=s*Math.sin(a);
      at[i*4]=Math.min(1,.08+.92*Math.pow(r(),6))*(.6+.4*r());at[i*4+1]=r();at[i*4+2]=r();}
    starGeo.setAttribute('position',new THREE.BufferAttribute(pos,3));starGeo.setAttribute('aS',new THREE.BufferAttribute(at,4));}
  const starU={...U,uRotT:{value:skyRotT},uStarK:{value:clamp(num(sk.stars,1),0,1.6)}};
  const starMat=keep(new THREE.ShaderMaterial({uniforms:starU,vertexShader:STAR_VS,fragmentShader:STAR_FS,transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending}));
  const stars=add(new THREE.Points(starGeo,starMat),3,false);
  // ---- The land: the far shore's treeline and mountains, the near bank and the cabin's point, spruces, the cabin --------
  const S=shoreOf(seed),layers=mountainLayers(seed,{layers:num(ld.layers,4),height:clamp(num(ld.mountains,1),.4,1.6)});
  const hazeOf=k=>V3(pal.haze.clone().lerp(new THREE.Color('#1c2a40'),.3),.5+k*.2);
  {const pos=[],am=[],idx=[];const ROWS=[1,.86,.66,.4,0];let base=0;
    for(const L of layers){const K=L.K;
      for(let i=0;i<K;i++){const x=-L.X+2*L.X*i/(K-1),y=L.ys[i],sl=(L.ys[Math.min(K-1,i+1)]-L.ys[Math.max(0,i-1)])/((2*L.X/(K-1))*(L.tree?1:L.R)*2);
        for(const f of ROWS){const yy=lerp(-4,y,f);if(L.tree)pos.push(x,yy,L.z);else pos.push(L.R*Math.sin(x),yy,-L.R*Math.cos(x));am.push(L.tree?x:x*L.R,f,L.haze,clamp(sl,-3,3));}}
      for(let i=0;i+1<K;i++)for(let r=0;r+1<ROWS.length;r++){const a=base+i*ROWS.length+r,b=a+ROWS.length;idx.push(a,a+1,b,a+1,b+1,b);}
      base+=K*ROWS.length;}
    const g=keep(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aM',new THREE.Float32BufferAttribute(am,4));g.setIndex(idx);
    add(new THREE.Mesh(g,mat(MTN_VS,MTN_FS)),0);}
  // the near bank and the point: a heightfield, only where it rises near the ice
  {const X0=-210,X1=210,Z0=-175,Z1=18,NX=210,NZ=120,hs=new Float32Array((NX+1)*(NZ+1));
    for(let j=0;j<=NZ;j++)for(let i=0;i<=NX;i++){const x=lerp(X0,X1,i/NX),z=lerp(Z0,Z1,(j/NZ)**.8);hs[j*(NX+1)+i]=landHeight(S,x,z);}
    const pos=[],nrm=[],idx=[],at=(i,j)=>[lerp(X0,X1,i/NX),hs[j*(NX+1)+i],lerp(Z0,Z1,(j/NZ)**.8)];
    for(let j=0;j<=NZ;j++)for(let i=0;i<=NX;i++){const p=at(i,j),a=at(Math.min(NX,i+1),j),b=at(Math.max(0,i-1),j),c=at(i,Math.min(NZ,j+1)),d=at(i,Math.max(0,j-1));
      const n=new THREE.Vector3().crossVectors(new THREE.Vector3(c[0]-d[0],c[1]-d[1],c[2]-d[2]),new THREE.Vector3(a[0]-b[0],a[1]-b[1],a[2]-b[2])).normalize();if(n.y<0)n.negate();pos.push(...p);nrm.push(n.x,n.y,n.z);}
    for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){const a=j*(NX+1)+i,b=a+NX+1;if(Math.max(hs[a],hs[a+1],hs[b],hs[b+1])<-.25)continue;idx.push(a,b,a+1,a+1,b,b+1);}
    const g=keep(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aN',new THREE.Float32BufferAttribute(nrm,3));g.setIndex(idx);
    add(new THREE.Mesh(g,mat(LAND_VS,LAND_FS)),1);}
  // spruces: on the point around the cabin and along the bank toward it, and a few far along the near bank
  const trees=[];{const r=rngOf(hash(`trees/${seed}`)),n=Math.round(14*clamp(num(ld.trees,1),0,1.6));
    for(let k=0;k<n;k++){const t=.45+.55*r(),p=S.spine(t),w=(30-14*t)*.7,x=p[0]+(r()-.5)*w,z=p[1]+(r()-.5)*w*.8;
      if(Math.hypot(x-S.cabin[0],z-S.cabin[1])<9)continue;const y=landHeight(S,x,z);if(y<.4)continue;trees.push([x,y-.2,z,7+8*r(),r()]);}
    for(let k=0;k<3;k++){const x=S.side*(150+40*r()),z=-8-30*r();trees.push([x,landHeight(S,x,z)-.2,z,10+8*r(),r()]);}}
  if(trees.length){const pos=[],at=[],idx=[];trees.forEach(([x,y,z,h,s],k)=>{for(const [qx,qy] of [[-1,0],[1,0],[-1,1],[1,1]]){pos.push(x,y,z);at.push(qx,qy,s,h);}const b=k*4;idx.push(b,b+1,b+2,b+2,b+1,b+3);});
    const g=keep(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aT',new THREE.Float32BufferAttribute(at,4));g.setIndex(idx);
    add(new THREE.Mesh(g,mat(TREE_VS,TREE_FS)),1);}
  // the cabin, its front to the shore: log walls, a snowy gable roof, a chimney, one warm window
  const cabinY=landHeight(S,...S.cabin)-.15,cabinYaw=Math.atan2(0-S.cabin[0],6-S.cabin[1]);
  const cabinFront=new THREE.Vector3(Math.sin(cabinYaw),0,Math.cos(cabinYaw)),cabinRight=new THREE.Vector3(Math.cos(cabinYaw),0,-Math.sin(cabinYaw));
  const windowAt=new THREE.Vector3();
  {const W=3.6,D=2.8,H=3,R=5.1,pos=[],ak=[],idx=[];
    const P=(x,y,z)=>{const v=new THREE.Vector3(S.cabin[0],cabinY,S.cabin[1]).addScaledVector(cabinRight,x).addScaledVector(cabinFront,z);v.y+=y;return [v.x,v.y,v.z];};
    // aK: kind (0 logs, 1 snow, 2 the window, 3 the chimney's stone), shade, and the window's own coordinates
    const quad=(a,b,c,d,k,w=1)=>{const o=pos.length/3;for(const [p,uv] of [[a,[0,0]],[b,[1,0]],[c,[0,1]],[d,[1,1]]]){pos.push(...p);ak.push(k,w,uv[0],uv[1]);}idx.push(o,o+1,o+2,o+2,o+1,o+3);};
    const wall=(x0,z0,x1,z1)=>quad(P(x0,0,z0),P(x1,0,z1),P(x0,H,z0),P(x1,H,z1),0);
    wall(-W,D,W,D);wall(W,-D,-W,-D);wall(-W,-D,-W,D);wall(W,D,W,-D);
    {const o=pos.length/3;for(const z of [D,-D])for(const p of [P(-W,H,z),P(W,H,z),P(0,R,z)]){pos.push(...p);ak.push(0,1,0,0);}idx.push(o,o+1,o+2,o+3,o+4,o+5);}
    // the roof, overhanging, snow on it
    const ov=.6;quad(P(-W-ov,H-.35,D+ov),P(0,R+.25,D+ov),P(-W-ov,H-.35,-D-ov),P(0,R+.25,-D-ov),1,.8);quad(P(W+ov,H-.35,D+ov),P(0,R+.25,D+ov),P(W+ov,H-.35,-D-ov),P(0,R+.25,-D-ov),1,1);
    // the chimney
    {const cx=W*.45,cz=-D*.3,cw=.45;for(const [a,b] of [[[-1,-1],[1,-1]],[[1,-1],[1,1]],[[1,1],[-1,1]],[[-1,1],[-1,-1]]])quad(P(cx+a[0]*cw,R-.8,cz+a[1]*cw),P(cx+b[0]*cw,R-.8,cz+b[1]*cw),P(cx+a[0]*cw,R+1.4,cz+a[1]*cw),P(cx+b[0]*cw,R+1.4,cz+b[1]*cw),3);}
    // the window on the front, a little proud of the wall
    {const wx=-1.1,wy=1.25,ww=.75,wh=.85,f=D+.04;quad(P(wx-ww,wy-wh,f),P(wx+ww,wy-wh,f),P(wx-ww,wy+wh,f),P(wx+ww,wy+wh,f),2);windowAt.set(...P(wx,wy,f+.3));}
    const g=keep(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aK',new THREE.Float32BufferAttribute(ak,4));g.setIndex(idx);
    add(new THREE.Mesh(g,mat(CABIN_VS,CABIN_FS)),1);}
  const chimneyAt=new THREE.Vector3(S.cabin[0],cabinY+6.6,S.cabin[1]).addScaledVector(cabinRight,1.6).addScaledVector(cabinFront,-.85);
  // the ice: from the near bank to the far shore (opaque; never in its own reflection)
  {const g=keep(new THREE.BufferGeometry()),X=2600;g.setAttribute('position',new THREE.Float32BufferAttribute([-X,0,30,X,0,30,-X,0,SHORE_Z-40,X,0,SHORE_Z-40],3));g.setIndex([0,2,1,1,2,3]);
    const m=new THREE.Mesh(g,mat(ICE_VS,ICE_FS));m.frustumCulled=false;m.renderOrder=2;scene.add(m);}
  // ---- The curtains: one mesh, columns shared out among the curtains present (rebuilt when their number changes) --------
  const curtainMat=glowMat(CURTAIN_VS,CURTAIN_FS),curtainMirror=glowMat(CURTAIN_VS,`#define MIRROR\n${CURTAIN_FS}`);
  let curtainMesh=null,curtainKey='';
  function curtainGeometry(n,q){const key=`${n}|${q}`;if(key===curtainKey&&curtainMesh)return;curtainKey=key;
    const Q=QUALITY[q],per=clamp(Math.floor(Q.cols/(n+1.5)),48,224),ring=Math.min(512,Math.round(per*2.2)),R=Q.rows,att=[],idx=[];let v0=0;
    const rows=Array.from({length:R},(_,r)=>-.07+1.42*Math.pow(r/(R-1),1.4));
    const strip=(k,cols)=>{for(let c=0;c<cols;c++){const u=-1+2*c/(cols-1);for(const v of rows)att.push(k,u,v);}
      for(let c=0;c+1<cols;c++)for(let r=0;r+1<R;r++){const a=v0+c*R+r,b=a+R;idx.push(a,b,a+1,a+1,b,b+1);}v0+=cols*R;};
    for(let k=0;k<n;k++)strip(k,per);strip(MAXC,ring);
    const g=new THREE.BufferGeometry();g.setAttribute('aC',new THREE.Float32BufferAttribute(att,3));g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(att.length),3));g.setIndex(idx);
    if(curtainMesh){curtainMesh.geometry.dispose();curtainMesh.geometry=g;curtainMesh.userData.mirror.geometry=g;}
    else{curtainMesh=add(new THREE.Mesh(g,curtainMat),4);curtainMesh.userData.aurora=U;curtainMesh.userData.mirror.material=curtainMirror;}}
  // ---- Lights: points (wisps, lanterns, the window, sparks, smoke) and ribbons (field lines, meteors, tethers) -----------
  const fxMat=glowMat(POINT_VS,POINT_FS),ribMat=glowMat(RIB_VS,RIB_FS);
  const fx=pointBuffersOf({fC:4,fS:3},512);add(new THREE.Points(fx.geometry,fxMat),6);
  const quadG=keep(new THREE.BufferGeometry());quadG.setAttribute('position',new THREE.Float32BufferAttribute([0,-1,0,1,-1,0,0,1,0,1,1,0],3));quadG.setIndex([0,1,2,2,1,3]);
  const rib=instancedBuffersOf(quadG,{rA:4,rB:4,rC:4,rD:4});add(new THREE.Mesh(rib.geometry,ribMat),5,false);
  function instancedBuffersOf(base,layout){
    const g=new THREE.InstancedBufferGeometry();g.index=base.index;for(const [k,v] of Object.entries(base.attributes))g.setAttribute(k,v);
    const self={geometry:g,capacity:0,arrays:{},n:0};
    self.ensure=n=>{if(n<=self.capacity)return;let c=Math.max(64,self.capacity);while(c<n)c*=2;
      for(const [name,size] of Object.entries(layout)){const a=new Float32Array(c*size),old=self.arrays[name];if(old)a.set(old.subarray(0,Math.min(old.length,a.length)));
        self.arrays[name]=a;g.deleteAttribute(name);const at=new THREE.InstancedBufferAttribute(a,size);at.setUsage(THREE.DynamicDrawUsage);g.setAttribute(name,at);}
      self.capacity=c;};
    self.write=(name,i,...v)=>{if(i>=self.capacity)self.ensure(i+1);const s=layout[name],a=self.arrays[name];for(let k=0;k<s;k++)a[i*s+k]=v[k]??0;};
    self.commit=n=>{g.instanceCount=n;self.n=n;for(const name of Object.keys(layout))g.attributes[name].needsUpdate=true;};
    self.ensure(256);self.dispose=()=>g.dispose();g.instanceCount=0;keep(self);return self;
  }
  function pointBuffersOf(layout,cap=64){
    const all={position:3,...layout},g=new THREE.BufferGeometry(),self={geometry:g,capacity:0,arrays:{},n:0};
    self.ensure=n=>{if(n<=self.capacity)return;let c=Math.max(cap,self.capacity);while(c<n)c*=2;
      for(const [name,size] of Object.entries(all)){const a=new Float32Array(c*size),old=self.arrays[name];if(old)a.set(old.subarray(0,Math.min(old.length,a.length)));
        self.arrays[name]=a;g.deleteAttribute(name);const at=new THREE.BufferAttribute(a,size);at.setUsage(THREE.DynamicDrawUsage);g.setAttribute(name,at);}
      self.capacity=c;};
    self.ensure(cap);g.setDrawRange(0,0);
    self.write=(name,i,...v)=>{if(i>=self.capacity)self.ensure(i+1);const s=all[name],a=self.arrays[name];for(let k=0;k<s;k++)a[i*s+k]=v[k]??0;};
    self.commit=n=>{g.setDrawRange(0,n);self.n=n;for(const name of Object.keys(all))g.attributes[name].needsUpdate=true;};
    self.dispose=()=>g.dispose();keep(self);return self;
  }
  let nFx=0,nRib=0;
  const C3=c=>c.isVector3?c:{x:c.r,y:c.g,z:c.b};
  function point(p,c,a,px,shape=7,world=0){if(nFx>=MAX_FX||!(a>.003))return;const k=C3(c);fx.write('position',nFx,p[0],p[1],p[2]);fx.write('fC',nFx,k.x,k.y,k.z,a);fx.write('fS',nFx,px,shape,world);nFx++;}
  function ribbon(a,b,wa,wb,c,alpha,aa=1,ab=1,core=0){if(nRib>=MAX_RIB||!(alpha>.003))return;const k=C3(c);rib.write('rA',nRib,a[0],a[1],a[2],wa);rib.write('rB',nRib,b[0],b[1],b[2],wb);rib.write('rC',nRib,k.x,k.y,k.z,alpha);rib.write('rD',nRib,aa,ab,core,0);nRib++;}
  // ---- Per-frame state ---------------------------------------------------------------------------------------------------
  let info={t:0,tsec:0,tview:0,overrides:{},agents:[]},curtains=[],files=new Map(),camPos=new THREE.Vector3(0,3,6);
  const pulses=[],storms=[],coronas=[],settles=[],breakups=[],meteors=[],kindles=[],widens=[],meetings=[];
  const push=(list,x,max=6)=>{list.push(x);if(list.length>max)list.shift();};
  const tempoOf=i=>Math.max(40,i.mood?.tempo||92);
  const near=(list,i,ms)=>list.filter(x=>x.at<=i.t&&i.t-x.at<ms*ctx.speed());
  const seatOf=a=>presence(a.provider).seat%8;
  const ep=()=>model.epoch;
  let stormNow=0,coronaNow=0,breakNow=0,lastStats={},foldA=[60,24,6],rip=new Float32Array(16);
  // The model's history prepared for sampling, again only when it changed.
  let prep=null,prepKey='';
  function prepared(){const m=M(),k=`${hist?'h':'l'}|${m.version}|${m.modules.size}`;if(k!==prepKey||!prep){prepKey=k;prep=prepare(m);}return prep;}
  // The music per bar (ctx.musicAt: the host's musical clock, a pure function of the performance's frames): how much rhythm
  // and energy the arrangement plays there, and which section it belongs to. Cached per bar.
  const barMusic=new Map();
  function musicOfBar(k,bar){const key=`${k}|${bar}`;let v=barMusic.get(key);
    if(!v){const ex=ctx.musicAt(k*bar+bar*.5);v={rhythm:ex?Math.pow(clamp(+ex.rhythm||0),1.5):0,energy:ex?clamp(+ex.dynamics||+ex.energy||0):0,section:ex?ex.section:null};barMusic.set(key,v);if(barMusic.size>512)barMusic.delete(barMusic.keys().next().value);}
    return v;}
  function sectionStart(t,bar){const b=Math.floor(t/bar),s0=musicOfBar(b,bar).section;if(s0===null||s0===undefined)return null;
    for(let k=b-1;k>=b-64;k--)if(musicOfBar(k,bar).section!==s0)return (k+1)*bar;return null;}
  // ---- The curtains at t: places (with their slow drift), the files' rays, the parameter and ray textures ----------------
  // A curtain drifts slowly about its place (ambient, a pure function of the view time).
  const drifted=(c,tv)=>{const d=clamp(num(mot.drift,.8),0,1.6),ph=c.seed*TAU;return {...c,x:c.x+d*46*Math.sin(tv/97+ph),z:c.z+d*70*Math.sin(tv/131+ph*1.7)};};
  const at3=(c,s,h,out=[0,0,0])=>curtainPoint(c,s,h,info.tview,foldA,rip,out,c.kf);
  function placeCurtains(i){
    const P=prepared();curtains=curtainsAt(P,i.t,cfg).slice(0,MAXC).map((c,k)=>({...drifted(c,i.tview),k}));files=new Map();
    for(const c of curtains){const st=c.files.reduce((m,f)=>Math.max(m,f.storm),0);c.storm=st;c.kf=(1+.7*st)*clamp(c.R/1350,.6,1.6);
      for(const f of c.files)files.set(f.id,{...f,curtain:c});}}
  // The touches: the agent's own tool event on a file (touch.js), and an attributed edit landing (the model's correlated cue).
  function touchList(i){
    const sp=ctx.speed(),gain=touchGain(G,i.overrides),out=[],src=M();
    for(const x of touchesAt(ctx.agents,i.agents,i.t,sp,{known:id=>files.has(id),max:4})){const a=i.agents.find(p=>p.id===x.agentId);out.push({fileId:x.fileId,age:x.age,at:x.at,k:x.env*x.k*gain,seat:a?seatOf(a):0,agentId:x.agentId,kind:x.kind});}
    for(const m of src.modules.values()){if(!Number.isInteger(m.agentVoice)||!Number.isFinite(m.lastAgent)||!files.has(m.id))continue;const age=(i.t-m.lastAgent)/sp/1000;if(age<0||age>3.2)continue;
      if(out.some(x=>x.fileId===m.id))continue;const a=i.agents.find(p=>p.voice===m.agentVoice);
      out.push({fileId:m.id,age,at:m.lastAgent,k:smooth(age/.15)*Math.pow(1-age/3.2,1.6)*gain,seat:a?seatOf(a):m.agentVoice%8,agentId:a?.id||null,kind:'edit'});}
    return out.sort((a,b)=>b.k-a.k||a.at-b.at).slice(0,4);}
  let touches=[];
  function writeCurtains(i){
    const sp=ctx.speed(),t=i.t,src=M(),inten=clamp(i.overrides.intensity??1,.3,1.5),act=clamp(i.activity||0),energy=clamp(i.music?i.music.energy:i.energy||0);
    const glowK=clamp(num(au.brightness,1),.4,1.8)*inten;cpData.fill(0);
    const put=(k,j,a,b,c,d)=>{const o=(k*8+j)*4;cpData[o]=a;cpData[o+1]=b;cpData[o+2]=c;cpData[o+3]=d;};
    const white=pal.highlight;
    for(const c of curtains){const k=c.k,lo=curtainColor(c.id,c.rank),hi=fringeColor(c.id,c.rank);
      // brighter with the work: its files edited lately, the director's activity, the music's energy
      let lit=0;for(const f of c.files){const m=src.modules.get(f.id);if(!m)continue;const last=Math.max(m.lastAgent,m.lastHuman);if(Number.isFinite(last)&&last<=t)lit=Math.max(lit,Math.exp(-(t-last)/sp/24000));}
      // the air near the horizon dims a low (far) curtain
      const elev=Math.atan2(c.alt,c.R),ext=.45+.55*smooth((elev-.07)/.2),size=.62+.5*clamp(Math.log2(1+c.files.length)/5);
      const b=(.5+.36*act+.16*energy+.28*lit)*glowK*ext*size*(.25+.75*c.kindle)*(1+1.6*breakNow)*(1-.25*coronaNow*(1-breakNow));c.bright=b;
      put(k,0,c.x,c.z,c.dx,c.dz);put(k,1,c.len,c.alt,c.H,c.seed);put(k,2,b,c.kindle,0,c.kf);put(k,3,lo[0],lo[1],lo[2],0);
      put(k,4,hi[0],hi[1],hi[2],(.8+.5*act+1.1*breakNow)*(1-.5*c.storm));put(k,5,0,0,0,0);
      // the rays: the top of the curtain follows its files' heights; each file's own ray; storm and validated shares; ignition
      rayF.fill(0);flashV.fill(0);flashH.fill(0);const L=c.len,tx=s=>(s/L*.5+.5)*(RAYW-1),sT=Math.max(cfg.sp*1.25,34),sR=clamp(cfg.sp*.07,2.4,7),sS=cfg.sp*1.6+70,sV=cfg.sp*.9+24;
      const w0=.22;for(let j=0;j<RAYW;j++){rayF[j*8]=.36*w0;rayF[j*8+4]=w0;}
      for(const f of c.files){const m=src.modules.get(f.id),last=m?Math.max(m.lastAgent,m.lastHuman):-Infinity,fresh=Number.isFinite(last)&&last<=t?Math.exp(-(t-last)/sp/20000):0;
        const x0=tx(f.s),put2=(sig,fn)=>{const r=sig/(2*L)*(RAYW-1)*3,a=Math.max(0,Math.floor(x0-r)),b=Math.min(RAYW-1,Math.ceil(x0+r));for(let j=a;j<=b;j++){const s=(j/(RAYW-1)*2-1)*L,u=(s-f.s)/sig;fn(j*8,Math.exp(-u*u));}};
        put2(sT,(o,w)=>{rayF[o]+=w*f.h;rayF[o+4]+=w;});
        put2(sR,(o,w)=>{rayF[o+1]+=w*f.alive*(.8+.7*fresh)*(1-.4*f.storm);});
        if(f.storm>0)put2(sS,(o,w)=>{rayF[o+2]=Math.max(rayF[o+2],w*f.storm);});
        if(f.valid>0)put2(sV,(o,w)=>{rayF[o+3]=Math.max(rayF[o+3],w*f.valid);});
        // ignition: a new ray (its birth), an agent's touch (its colour), a person's edit (warm white): a pulse up the ray
        let fl=null;const born=Number.isFinite(f.born)?(t-f.born)/sp/1000:Infinity;
        if(born>=0&&born<3.6)fl={k:smooth(born/.12)*Math.pow(1-born/3.6,1.4)*1.2,h:smooth(born/1.3)*f.h*1.08,c:[lo[0]*.5+white.r*.5,lo[1]*.5+white.g*.5,lo[2]*.5+white.b*.5]};
        const tc=touches.find(x=>x.fileId===f.id);if(tc&&(!fl||tc.k>fl.k)){const ac=agentCol[tc.seat%8];fl={k:tc.k*(tc.kind==='edit'?.7:.32),h:smooth(tc.age/.9)*f.h*1.05,c:[ac.r*.85+lo[0]*.15,ac.g*.85+lo[1]*.15,ac.b*.85+lo[2]*.15]};}
        const hu=m&&Number.isFinite(m.lastHuman)&&m.lastHuman>=m.lastAgent?(t-m.lastHuman)/sp/1000:Infinity;
        if(hu>=0&&hu<2.6&&(!fl||fl.k<.5)){fl={k:smooth(hu/.12)*Math.pow(1-hu/2.6,1.5)*.7,h:smooth(hu/.9)*f.h,c:[1,.86,.7]};}
        if(fl&&fl.k>.005)put2(sR*1.05,(o,w)=>{const v=fl.k*w,j=o>>3;if(v>flashV[j]){flashV[j]=v;rayF[o+5]=fl.c[0]*v;rayF[o+6]=fl.c[1]*v;rayF[o+7]=fl.c[2]*v;flashH[j]=fl.h;}});}
      for(let j=0;j<RAYW;j++){const o=j*8,q=(k*RAYW+j)*4;rayA[q]=Math.round(clamp(rayF[o]/Math.max(rayF[o+4],1e-6)/1.5)*255);rayA[q+1]=Math.round(clamp(rayF[o+1]/2)*255);
        rayA[q+2]=Math.round(clamp(rayF[o+2])*255);rayA[q+3]=Math.round(clamp(rayF[o+3])*255);
        rayB[q]=Math.round(clamp(rayF[o+5]/4)*255);rayB[q+1]=Math.round(clamp(rayF[o+6]/4)*255);rayB[q+2]=Math.round(clamp(rayF[o+7]/4)*255);rayB[q+3]=flashV[j]>.004?Math.max(1,Math.round(clamp(flashH[j]/1.25)*255)):0;}}
    // the corona (recovery) and the breakup's corona storm: a folded ring overhead, its rays converging on the magnetic zenith
    const ck=Math.max(coronaNow,breakNow);
    if(ck>.003){const k=MAXC,r=lerp(640,breakNow>coronaNow?300:250,coronaGather),C0=coronaColors(),cx=camPos.x,cz=camPos.z+MAG[2]/MAG[1]*ALT,len=Math.PI*r;
      put(k,0,0,0,1,0);put(k,1,len,ALT*.95,560*cfg.height*(1.05+.2*breakNow),.37+seed%7*.05);put(k,2,ck*glowK*(1.1+.7*breakNow),1,1,.8+.5*breakNow);
      put(k,3,C0[0][0],C0[0][1],C0[0][2],0);put(k,4,C0[1][0],C0[1][1],C0[1][2],1.1+.8*breakNow);put(k,5,r,cx,cz,0);
      for(let j=0;j<RAYW;j++){const q=(k*RAYW+j)*4,u=j/(RAYW-1);rayA[q]=Math.round(clamp((.8+.2*Math.sin(u*TAU*5+seed))/1.5)*255);rayA[q+1]=0;rayA[q+2]=0;rayA[q+3]=0;rayB[q]=rayB[q+1]=rayB[q+2]=rayB[q+3]=0;}}
    else{for(let j=0;j<RAYW;j++){const q=(MAXC*RAYW+j)*4;rayA[q]=rayA[q+1]=rayA[q+2]=rayA[q+3]=0;rayB[q]=rayB[q+1]=rayB[q+2]=rayB[q+3]=0;}}
    let anyFlash=0;for(let q=3;q<rayB.length;q+=4)if(rayB[q]){anyFlash=1;break;}U.uFlash.value=anyFlash;
    cpTex.needsUpdate=true;rayTexA.needsUpdate=true;if(anyFlash||flashWas)rayTexB.needsUpdate=true;flashWas=anyFlash;
  }
  let coronaGather=0,flashWas=1;
  // The corona's colours: the brightest curtain's (or the identity's own)
  function coronaColors(){let best=null;for(const c of curtains)if(!best||c.bright>best.bright)best=c;
    return best?[curtainColor(best.id,best.rank),fringeColor(best.id,best.rank)]:[[pal.primary.r,pal.primary.g,pal.primary.b],[pal.secondary.r,pal.secondary.g,pal.secondary.b]];}
  // ---- Effects: recorded intents only -----------------------------------------------------------------------------------
  function effect(cmd,i){
    if(i)info=i;const s=clamp(cmd.scale,0,1.6),subj=cmd.subject||{},at=Number.isFinite(cmd.at)?cmd.at:info.t;if(s<=0)return;
    const ids=new Set(subj.fileIds||(subj.fileId?[subj.fileId]:[]));
    switch(cmd.effect){
      case 'pulsate':push(pulses,{at,files:ids,s,id:cmd.id??at});break;
      case 'storm':push(storms,{at,files:ids,s});break;
      case 'corona':push(coronas,{at,files:ids,s});break;
      case 'settle':push(settles,{at,files:ids,group:subj.groupId||null,s});break;
      case 'breakup':{const full=cmd.tier>=3&&breakupAllowed(ctx.director.lasting(),cmd.at);push(breakups,{at,files:ids,group:subj.groupId||null,s,full,grand:full&&cmd.tier>=4},4);break;}
      case 'meteor':push(meteors,{at,files:ids,s},4);break;
      case 'kindle':case 'brighten':push(kindles,{at,group:subj.groupId||null,files:ids,s:cmd.effect==='kindle'?s:s*.6},10);break;
      case 'widen':push(widens,{at,s});break;
      // two agents on one file (agent.collision; the director gives it the family's integration look): two wisps meeting
      // at that ray. A real connection's field line draws itself from the model's own times.
      case 'field-line':if(cmd.intent==='agent.collision'&&subj.fileId)push(meetings,{at,fileId:subj.fileId,providers:(cmd.detail?.providers||[]).slice(0,4),s},4);break;
      default:break;// a new ray, a fading one: drawn from the model's own times
    }
  }
  const curtainOf=ids=>{const n=new Map();for(const id of ids||[]){const f=files.get(id);if(f)n.set(f.curtain,(n.get(f.curtain)||[]).concat(f));}return n;};
  function slots(i){
    const sp=ctx.speed(),age=x=>(i.t-x.at)/1000/sp,out=[],inten=clamp(i.overrides.intensity??1,.3,1.4);
    for(const x of near(pulses,i,7000)){const by=curtainOf(x.files),dir=rand(hash(String(x.id)))<.5?1:-1;const list=by.size?[...by]:curtains.map(c=>[c,c.files]);
      for(const [c,fs] of list){let a=Infinity,b=-Infinity;for(const f of fs){const u=f.s/c.len;a=Math.min(a,u);b=Math.max(b,u);}if(!(a<=b)){a=-.8;b=.8;}a=Math.max(-1,a-.25);b=Math.min(1,b+.25);
        out.push({e:[0,c.k,dir>0?a:b,dir>0?b:a],f:[age(x),x.s*inten,rand(hash(`${x.id}/${c.id}`)),0]});}}
    for(const x of near(kindles,i,4500)){let c=x.group?curtains.find(q=>q.id===x.group):null;if(!c){const by=curtainOf(x.files);c=[...by.keys()][0]||null;}if(!c)continue;
      const dir=rand(hash(`${x.at}/${c.id}`))<.5;out.push({e:[1,c.k,dir?-1.1:1.1,dir?1.1:-1.1],f:[age(x),x.s*inten*.9,0,0]});}
    for(const x of [...near(settles,i,7500),...near(breakups,i,7500).filter(b=>!b.full)]){let cs=x.group?curtains.filter(q=>q.id===x.group):[];if(!cs.length)cs=[...curtainOf(x.files).keys()];if(!cs.length)cs=curtains.slice(0,1);
      for(const c of cs)out.push({e:[2,c.k,-1,1],f:[age(x),x.s*inten*(x.full===false?1.2:.8),0,0]});}
    for(const x of near(widens,i,6000))out.push({e:[1,-1,-1.1,1.1],f:[age(x),x.s*inten*.5,0,0]});
    out.sort((a,b)=>a.f[0]-b.f[0]);
    for(let k=0;k<8;k++){const x=out[k];if(!x){U.uE.value[k].set(-1,-2,0,0);U.uEF.value[k].set(0,0,0,0);continue;}U.uE.value[k].set(...x.e);U.uEF.value[k].set(...x.f);}
    U.uNE.value=Math.min(8,out.length);
    return out;
  }
  // ---- Lasting: lanterns on the shore for verified milestones (a candle for a validated refactor), from the director's record
  let lnSig='',lanterns=[];
  function lanternsOf(i){const all=ctx.director.lasting();let sig='';for(const l of all)sig+=`|${l.type}:${l.first}:${l.count}`;
    if(sig!==lnSig){lnSig=sig;const list=[];for(const l of all)list.push({t:l.first,kind:l.type==='milestone.achieved'?1:0,count:l.count});
      list.sort((a,b)=>a.t-b.t);lanterns=list.slice(0,8).map((l,k)=>{const p=lanternAt(S,k),y=Math.max(.2,landHeight(S,p[0],p[1]));return {...l,k,p:[p[0],y+(l.kind?1.1:.55),p[1]]};});}
    return lanterns.filter(l=>l.t<=i.t);}
  // ---- Field lines: the present's dependencies between curtains ------------------------------------------------------------
  const arcPts=[];let arcs=[];
  function arcsAt(i){const src=M(),list=[],sp=ctx.speed();
    for(const l of src.links.values()){if(!src.alive(l,i.t))continue;const a=files.get(l.a),b=files.get(l.b);if(!a||!b||a.curtain===b.curtain)continue;
      const born=src.bornAt(l),drawn=born===-Infinity?1:smooth((i.t-born)/(2400*sp)),gone=l.removed!==null?1-smooth((i.t-l.removed)/(1600*sp)):1;if(drawn*gone<=.003)continue;
      list.push({key:l.key,a,b,born,drawn,alpha:gone});}
    list.sort((x,y)=>y.born-x.born||(x.key<y.key?-1:1));return arcs=list.slice(0,MAX_ARCS);}
  const footOf=(f,h=.08,out=[0,0,0])=>at3(f.curtain,f.s,f.curtain.H*h,out);
  function arcLine(r,out=[]){const A=footOf(r.a,.06),B=footOf(r.b,.06);return fieldLine(A,B,r.a.curtain.H*r.a.h*.32,r.b.curtain.H*r.b.h*.32,14,out);}
  // ---- Agents: wisps (pure functions of the observed lifecycle and time) ------------------------------------------------------
  const agentState=new Map();let travelNow=0,lineNow=0;
  let editsT=null;const edits=new Map();
  function editsOf(voice){if(editsT!==info.t){edits.clear();editsT=info.t;}let l=edits.get(voice);
    if(!l){l=[...M().modules.values()].filter(m=>m.agentVoice===voice&&Number.isFinite(m.lastAgent)&&files.has(m.id)).sort((a,b)=>b.lastAgent-a.lastAgent).slice(0,4);edits.set(voice,l);}return l;}
  const lastEdit=(p,t)=>{for(const m of editsOf(p.voice))if(m.lastAgent<=t)return m;return null;};
  function workOf(p,t){if(p.display==='tool'&&p.fileId&&files.has(p.fileId))return p.fileId;const m=lastEdit(p,t);return m&&t-m.lastAgent<DWELL*ctx.speed()?m.id:null;}
  // A goal: at work, at its ray's foot a little toward the shore; busy without a file, circling under its home curtain;
  // waiting, hovering low over the ice near the shore (reflected in it); with no home, circling over the lake.
  function goalOf(p,tv,t){
    const w=workOf(p,t);if(w){const f=files.get(w),q=footOf(f,.1+.03*Math.sin(tv*1.4));return [q[0]+(camPos.x-q[0])*.04,q[1]+(camPos.y-q[1])*.04,q[2]+(camPos.z-q[2])*.04];}
    const ph=rand(hash(p.id))*TAU,home=p.home&&files.has(p.home)?files.get(p.home):null,waiting=p.display==='waiting'||p.display==='dormant'||p.display==='connected';
    if(waiting||!p.busy){const r=rand(hash(p.id)+1);return [(r-.5)*70+8*Math.sin(tv*.13+ph),3.4+1.2*Math.sin(tv*.41+ph)+r*2,-26-46*rand(hash(p.id)+2)+5*Math.cos(tv*.11+ph)];}
    if(home){const q=footOf(home,-.12),a=ph+tv*.22,R=90;return [q[0]+Math.cos(a)*R,q[1]+Math.sin(a*1.3)*24,q[2]+Math.sin(a)*R*.6];}
    return [Math.cos(ph+tv*.05)*260,240+30*Math.sin(tv*.2+ph),-900+Math.sin(ph+tv*.05)*180];}
  const spotOf=(p,t)=>{const w=workOf(p,t)||(p.home&&files.has(p.home)?p.home:null),f=w&&files.get(w);return f?{curtain:f.curtain.id,id:f.id}:null;};
  // A journey between two curtains along the field lines joining them (at most three), else null.
  let jT=null;const jMid=new Map();
  function journey(A,B,q,g){
    if(!A||!B||A.curtain===B.curtain)return null;if(jT!==info.t){jMid.clear();jT=info.t;}const key=`${A.id}>${B.id}`;let mid=jMid.get(key);
    if(mid===undefined){mid=null;const adj=new Map();for(const r of arcs){if(r.drawn<1||r.alpha<1)continue;for(const [x,y] of [[r.a.curtain.id,r],[r.b.curtain.id,r]]){if(!adj.has(x))adj.set(x,[]);adj.get(x).push(y);}}
      const prev=new Map([[A.curtain,null]]),Q=[A.curtain];for(let h=0;h<Q.length&&!prev.has(B.curtain);h++){const c=Q[h];let d=0;for(let x=c;prev.get(x);x=prev.get(x).from)d++;if(d>=3)continue;
        for(const r of adj.get(c)||[]){const o=r.a.curtain.id===c?r.b.curtain.id:r.a.curtain.id;if(!prev.has(o)){prev.set(o,{from:c,r,rev:r.a.curtain.id!==c});Q.push(o);}}}
      if(prev.has(B.curtain)){const legs=[];for(let x=B.curtain;prev.get(x);x=prev.get(x).from)legs.unshift(prev.get(x));const pts=[];
        for(const L of legs){const P=arcLine(L.r,[]).map(p=>p.slice());if(L.rev)P.reverse();for(const p of P)pts.push(p);}
        let len=0;for(let k=1;k<pts.length;k++)len+=dist3(pts[k-1],pts[k]);mid={pts,len};}
      jMid.set(key,mid);}
    if(!mid)return null;const P=mid.pts;return {pts:[q,...P,g],len:dist3(q,P[0])+mid.len+dist3(P[P.length-1],g)};}
  const dist3=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  function pathAt(path,s){const P=path.pts;for(let k=1;k<P.length;k++){const d=dist3(P[k-1],P[k]);if(s<=d||k===P.length-1){const u=d>1e-9?clamp(s/d):1;
    return [lerp(P[k-1][0],P[k][0],u),lerp(P[k-1][1],P[k][1],u),lerp(P[k-1][2],P[k][2],u)];}s-=d;}return P[P.length-1].slice();}
  // From where the wisp was when its goal last changed (a state, an edit landing, its dwell ending) to the new goal:
  // between curtains the field lines join, once it had reached the goal before, along those lines (1.8 to 4.5 s); a
  // change that keeps its goal at the same ray (a tool's 40 ms ending while it travels there) lets it fly on along the
  // lines it is on; otherwise a lifted arc up through the night. Where it was is this same function at the moment before
  // the change (each moment computed once a frame, at most MOVES_BACK changes back; beyond them the goal before), so a
  // change that interrupts a move never makes it jump.
  const MOVES_BACK=32,ARRIVED=6;let wasT=null;const wasAt=new Map();
  function agentBefore(id,t,depth){if(wasT!==info.t){wasAt.clear();wasT=info.t;}const key=`${id}|${t}`;if(wasAt.has(key))return wasAt.get(key);
    const x=agentAt(id,t,(t-model.epoch)/1000/ctx.speed(),depth);wasAt.set(key,x);return x;}
  const sameSpot=(A,B)=>!!A&&!!B&&A.curtain===B.curtain&&A.id===B.id;
  function restOf(P,from,s){let x=from;for(let j=0;j<P.length;j++){const d=dist3(x,P[j]);if(s<d)return P.slice(j);s-=d;x=P[j];}return [];}
  function alongFrom(P,from,s,to){const pts=[from,...P,to];return pathAt({pts},s);}
  function agentAt(id,t,tv,depth=0){const a=ctx.agents.presence(id,t);if(!a)return null;let g=goalOf(a,tv,t);
    const sp=ctx.speed(),m=lastEdit(a,t);let tc=t-a.since;if(m){tc=Math.max(tc,m.lastAgent);if(m.lastAgent+DWELL*sp<=t)tc=Math.max(tc,m.lastAgent+DWELL*sp);}
    if(t-tc<TRAVEL_MAX*sp){const prev=ctx.agents.presence(id,tc-1);if(prev){const q=goalOf(prev,(tc-1-model.epoch)/1000/sp,tc-1),w=depth<MOVES_BACK?agentBefore(id,tc-1,depth+1):null,was=w?.p||q;
      const A=spotOf(prev,tc-1),B=spotOf(a,t);let pts=null,min=TRAVEL;
      if(dist3(was,q)<ARRIVED){const path=journey(A,B,q,g);if(path)pts=path.pts.slice(1,-1);}
      else if(w?.rest&&sameSpot(A,B)){pts=w.rest;min=TRAVEL/2;}
      if(pts&&pts.length){const total=dist3(was,pts[0])+pathLen(pts)+dist3(pts[pts.length-1],g),T=clamp(total/FLY_V*1000,min,TRAVEL_MAX)*sp;
        if(t-tc<T){const at=smooth((t-tc)/T)*total;return {a,p:alongFrom(pts,was,at,g),travel:true,line:true,rest:restOf(pts,was,at)};}}
      else{const D=dist3(was,g),T=clamp(D/FLY_V*1000,TRAVEL,TRAVEL_MAX)*sp;if(t-tc<T){const k=smooth((t-tc)/T),lift=Math.sin(k*Math.PI)*Math.min(260,D*.22);
        return {a,p:[lerp(was[0],g[0],k),lerp(was[1],g[1],k)+lift,lerp(was[2],g[2],k)],travel:true};}}}}
    return {a,p:g};}
  const pathLen=P=>{let l=0;for(let j=1;j<P.length;j++)l+=dist3(P[j-1],P[j]);return l;};
  function updateAgents(i){
    const sp=ctx.speed(),trailK=clamp(num(G.agents?.trail,1),.2,2.2),prom=clamp(num(G.agentProminence,.8),.3,1),seen=new Map();travelNow=0;lineNow=0;
    for(const a of i.agents.slice(0,12)){const h=agentAt(a.id,i.t,i.tview);if(!h)continue;seen.set(a.id,a);if(h.travel)travelNow++;if(h.line)lineNow++;
      let st=agentState.get(a.id);if(!st){st={pos:new THREE.Vector3()};agentState.set(a.id,st);}st.pos.set(...h.p);
      const seat=seatOf(a),c=agentCol[seat],alpha=a.alpha*(a.busy?1:.7)*prom,sub=a.subagent||a.parent?.6:1,tk=touches.find(x=>x.agentId===a.id)?.k||0;
      // its trail: where it was (sampled from its pure path)
      // (along a field line, a denser, brighter comet)
      const TR=h.line?36:18,dt=h.line?45:80;
      for(let s=TR;s>=1;s--){const q=agentAt(a.id,i.t-s*dt*sp*trailK,i.tview-s*dt/1000*trailK);if(!q)continue;const f=1-s/(TR+1);point(q.p,c,alpha*f*f*(h.line?1.2:.9),(2.5+7*f)*sub,8);}
      point(h.p,c,alpha*.4,70*sub,11);point(h.p,c,alpha*(1.5+tk),34*sub,seat<6?seat:6);point(h.p,{r:1,g:1,b:1},alpha,6*sub,8);
      // at its ray: a thread of its colour up the ray it touches
      const w=h.travel?null:workOf(a,i.t);if(w){const f=files.get(w),top=footOf(f,f.h*.85),foot=footOf(f,.06);ribbon(h.p,foot,.8,1.4,c,alpha*(.3+.6*tk),1,.4);ribbon(foot,top,1.4,.6,c,alpha*.22*(.4+tk),.6,0);}}
    for(const id of agentState.keys())if(!seen.has(id))agentState.delete(id);
    // subagents: a faint filament in their colour from the parent's wisp, a bead of light running down it every five seconds
    let tethers=0;for(const a of seen.values()){const p=a.parent?seen.get(a.parent):null;if(!p||p.state==='disconnected'||p.state==='completed')continue;
      const A=agentState.get(p.id).pos,B=agentState.get(a.id).pos,c=agentCol[seatOf(a)],al=Math.min(a.alpha,p.alpha)*prom,L=A.distanceTo(B);if(L<1)continue;
      const lift=Math.min(60,L*.18),N=24,ph=i.tview/5,bead=(ph-Math.floor(ph))*1.2-.1;let prev=null;
      for(let k=0;k<=N;k++){const u=k/N,q=[lerp(A.x,B.x,u),lerp(A.y,B.y,u)+Math.sin(u*Math.PI)*lift,lerp(A.z,B.z,u)];if(prev){const b=Math.exp(-(((u-bead)/.05)**2));ribbon(prev,q,.35+.6*b,.35+.6*b,c,al*(.22+.7*b)*smooth(u/.08)*smooth((1-u)/.08),1,1);}prev=q;}
      tethers++;}
    lastStats.tethers=tethers;
    // agent.collision (two agents on one file): each wisp runs in toward that ray's foot from its own side over 1.2 s; where
    // they meet a ring in both colours spreads and fades. A pure function of the time since the event.
    for(const mt of near(meetings,i,4200)){const f=files.get(mt.fileId);if(!f)continue;const a0=(i.t-mt.at)/1000/sp,ph=rand(hash(`${mt.at}/${mt.fileId}`)),P=mt.providers.length?mt.providers:['a','b'];
      const kk=smooth(a0/1.2),fade=1-smooth((a0-2.6)/1.6),cols=P.map(pv=>agentCol[presence(pv).seat%8]),site=footOf(f,.1);
      P.forEach((pv,j)=>{const ang=(ph+j/P.length)*TAU,seat=presence(pv).seat%8;
        for(let tr=5;tr>=0;tr--){const d=Math.min(160,160*(1-kk)+tr*9*(1-kk*.6)),q=[site[0]+Math.cos(ang)*d,site[1]+Math.sin(ang)*d*.6,site[2]+Math.sin(ang*1.7)*d*.3];
          point(q,cols[j],(tr?.5*(1-tr/6):1.4)*fade*mt.s*(a0<1.25?1:.35),tr?4+2*(6-tr)/6:24,tr?8:seat<6?seat:6);}});
      if(a0>=1.1){const b=a0-1.1,c0=cols[0],c1=cols[1%cols.length],mx={r:(c0.r+c1.r)/2,g:(c0.g+c1.g)/2,b:(c0.b+c1.b)/2};
        point(site,mx,1.8*Math.exp(-b*2.2)*mt.s,20+70*smooth(b/1.4),10);point(site,{r:1,g:1,b:1},1.2*Math.exp(-b*4)*mt.s,10,8);}}
  }
  // ---- The scene's lights: field lines, lanterns, the cabin, meteors, smoke, a storm's sparks ---------------------------
  const sph=(az,el,r,out=[0,0,0])=>{out[0]=camPos.x+Math.sin(az)*Math.cos(el)*r;out[1]=camPos.y+Math.sin(el)*r;out[2]=camPos.z-Math.cos(az)*Math.cos(el)*r;return out;};
  function writeScene(i){
    const t=i.t,sp=ctx.speed(),tv=i.tview,inten=clamp(i.overrides.intensity??1,.4,1.3),src=M();let validated=0,stressed=0;
    for(const f of files.values()){const m=src.modules.get(f.id);if(!m)continue;const st=src.stateAt(m,t);if(st==='validated')validated++;if(st==='stressed')stressed++;}
    // field lines: faint arcs between curtains; a pulse runs along each from the importer when its file fires
    arcsAt(i);const ak=clamp(Math.sqrt(4/Math.max(1,arcs.length)),.2,1)*inten;
    for(const r of arcs){const P=arcLine(r,arcPts),n=P.length-1,m=Math.max(1,Math.round(n*r.drawn)),c=V3(new THREE.Color().fromArray(curtainColor(r.a.curtain.id,r.a.curtain.rank)).lerp(pal.highlight,.35),1);
      for(let k=0;k<m;k++){const u=(k+.5)/n,e=smooth(u/.15)*smooth((1-u)/.15);ribbon(P[k],P[k+1],10,10,c,.03*ak*r.alpha*e,1,1,.12);}
      const mm=src.modules.get(r.a.id),fired=mm?Math.max(mm.lastAgent,mm.lastHuman):-Infinity,pa=Number.isFinite(fired)?(t-fired)/1000/sp:Infinity;
      if(r.drawn>=1&&pa>=0&&pa<2.4){const s0=smooth(pa/2)*n;for(let k=0;k<4;k++){const s1=s0-k*.5;if(s1<0)break;const j=Math.min(n-1,Math.floor(s1)),f=s1-j,p=[lerp(P[j][0],P[j+1][0],f),lerp(P[j][1],P[j+1][1],f),lerp(P[j][2],P[j+1][2],f)];
        point(p,c,(k?.5*(1-k/4):1.3)*inten*r.alpha*(1-smooth((pa-2)/.4)),k?6:13,8);}}}
    // lanterns: a warm flame and its halo on the shore for each verified milestone (a small candle for a refactor)
    const ls=lanternsOf(i);let ng=0;
    for(const l of ls){const fl=.86+.08*Math.sin(tv*5.1+l.k*1.7)+.06*Math.sin(tv*11.3+l.k*4.1),lv=clamp(.7+.3*Math.min(3,l.count)),fresh=Math.exp(-(t-l.t)/sp/6000);
      point(l.p,pal.accent,(1.4+1.6*fresh)*fl*lv,(l.kind?16:9)*(1+fresh*.5),9);point(l.p,pal.accent,.32*fl*lv*(1+fresh),l.kind?90:46,11);
      if(ng<10){U.uGlow.value[ng++].set(l.p[0],l.p[2],l.kind?5:3,(.1+.12*fresh)*fl*lv);}}
    // the cabin's window: its glow on the snow in front, flaring at a commit; smoke from the chimney
    let flare=0;for(const x of meteors){const a=(t-x.at)/1000/sp;if(a>=0&&a<5)flare=Math.max(flare,x.s*smooth(a/.2)*Math.exp(-a*.55));}
    const win=(1+2.2*flare)*clamp(inten,.6,1.2);U.uWin.value=win*1.6;
    point([windowAt.x,windowAt.y,windowAt.z],pal.accent,.55*win,30+30*flare,11);point([windowAt.x,windowAt.y,windowAt.z],pal.accent,.25*win,8,8);
    const pool=windowAt.clone().addScaledVector(cabinFront,3.2);if(ng<10)U.uGlow.value[ng++].set(pool.x,pool.z,4.5,.075*win);U.uNG.value=ng;
    for(let k=0;k<10;k++){const a=(tv*.18+k/10)%1,r1=rand(hash(`smoke/${seed}/${k}`));point([chimneyAt.x+a*9*(.6+.4*r1)+Math.sin(tv*.4+k)*.6,chimneyAt.y+a*16,chimneyAt.z-a*3],pal.highlight,.035*(1-a)*smooth(a/.1)*(.6+.4*r1),10+60*a,11,1.2+5*a);}
    // meteors: one for each commit, and an occasional one while nothing happens
    const list=[...near(meteors,i,3000).map(x=>meteorOf(`${seed}/c/${x.at}`,(x.at-ep())/1000/sp,1.2*x.s)),...idleMeteors(seed,tv)];
    for(const mt of list){const a=tv-mt.t0;if(a<0||a>mt.dur+.6)continue;
      const D0=sph(mt.az,mt.el,1),E1=[Math.cos(mt.az),0,Math.sin(mt.az)],E2=[-Math.sin(mt.az)*Math.sin(mt.el),Math.cos(mt.el),Math.cos(mt.az)*Math.sin(mt.el)];
      const T=[0,1,2].map(j=>Math.cos(mt.head)*E1[j]+Math.sin(mt.head)*E2[j]),d0=[D0[0]-camPos.x,D0[1]-camPos.y,D0[2]-camPos.z];
      const P=phi=>[0,1,2].map(j=>[camPos.x,camPos.y,camPos.z][j]+(d0[j]*Math.cos(phi)+T[j]*Math.sin(phi))*2600);
      const hd=mt.len*smooth(Math.min(1,a/mt.dur)),tail=mt.len*.42,fade=1-smooth((a-mt.dur)/.6),br=mt.bright*fade*inten;
      let prev=P(Math.max(0,hd-tail));for(let k=1;k<=10;k++){const ph=Math.max(0,hd-tail*(1-k/10)),q=P(ph);ribbon(prev,q,2.2*k/10,2.2*(k+1)/10,{r:.85,g:1,b:.9},br*.5*(k/10)**2,1,1);prev=q;}
      if(a<mt.dur)point(P(hd),{r:.9,g:1,b:.92},br*1.3,7,8);}
    // a storm's sparks: red embers falling from the covered curtain's lower edge as it breaks into a storm
    for(const x of near(storms,i,4500)){const a=(t-x.at)/1000/sp;for(const id of x.files){const f=files.get(id);if(!f)continue;const r=rand(hash(`${x.at}/${id}`)),q=footOf(f,0);
      for(let k=0;k<6;k++){const u=(a*1.1+k/6+r)%1,ang=(r+k*.17)*TAU;point([q[0]+Math.cos(ang)*u*40,q[1]-u*70-u*u*30,q[2]+Math.sin(ang)*u*20],pal.warning,(1-u)*1.4*Math.exp(-a*.5)*x.s,5,8);}}}
    lastStats={...lastStats,validated,stressed,arcs:arcs.length,lanterns:ls.length,meteors:list.filter(m=>tv-m.t0>=0&&tv-m.t0<=m.dur).length};
  }
  // ---- Frame ------------------------------------------------------------------------------------------------------------
  function update(i){
    info=i;const sp=ctx.speed(),qi=clamp(Math.round(i.quality||0),0,3),tv=i.tview;shoreAt(i,camPos);
    const [w,h]=ctx.pipeline.size;U.uPx.value=Math.max(.4,h/1080);U.uRes.value.set(w,h);U.uV.value=tv;U.uQ.value=i.quality||0;
    // the corona (recovery) and the breakup now: they gather the sky, then it settles
    coronaNow=0;coronaGather=0;for(const x of near(coronas,i,CORONA_S*1000)){const a=(i.t-x.at)/1000/sp,k=smooth(a/1.6)*(1-smooth((a-7)/(CORONA_S-7)))*clamp(x.s,.5,1.2);if(k>coronaNow){coronaNow=k;coronaGather=smooth(a/2.2)*(1-smooth((a-6.5)/4));}}
    breakNow=0;for(const x of near(breakups,i,BREAKUP_S*1000)){if(!x.full)continue;const a=(i.t-x.at)/1000/sp,k=smooth(a/1.2)*(1-smooth((a-10)/(BREAKUP_S-10)))*(x.grand?1.15:1);if(k>breakNow){breakNow=k;coronaGather=Math.max(coronaGather,smooth(a/2.5)*(1-smooth((a-9)/6)));}}
    placeCurtains(i);touches=touchList(i);
    // folds: slow and middle folds always, the fast one deepening with the work (a quiet arc versus a substorm)
    const act=clamp(i.activity||0),fK=clamp(num(au.folds,.9),0,1.8),energy=clamp(i.music?i.music.energy:i.energy||0);
    foldA=[48*fK,30*fK*(1+.4*act),(6+22*act+8*energy+30*breakNow)*fK];U.uA.value.set(...foldA);
    U.uFast.value=clamp(act*1.3+breakNow);
    // the music, only where the host gives its clock: ripples on the bars (each bar's depth read at that bar, so a ripple
    // under way never changes), the rays' shimmer on the eighths the arrangement plays, a surge at a section's onset
    rip.fill(0);U.uEighth.value=0;U.uSurge.value.set(0,0);
    const beatMs=60000/tempoOf(i),reactive=clamp(num(MU.reactivity,.6),0,1);
    if(ctx.musicAt&&i.music){const bar=beatMs*4,b=Math.floor(i.t/bar),ra=.4+.6*reactive,rk=clamp(num(mot.ripple,.8),0,1.6);
      for(let k=0;k<4;k++){const bk=b-k,m=musicOfBar(bk,bar),t0=(bk*bar-ep())/1000/sp;rip[k*4]=t0;rip[k*4+1]=18*rk*ra*(.3+.7*m.energy);rip[k*4+2]=rand(hash(`rip/${seed}/${bk}`))<.5?1:-1;}
      const eMs=beatMs/2,e=Math.floor(i.t/eMs),eo=((e%2)+2)%2===1?e:e-1,at=eo*eMs;
      U.uEighth.value=musicOfBar(Math.floor(at/bar),bar).rhythm*Math.exp(-(i.t-at)/eMs*2.2)*clamp(num(mot.shimmer,.8),0,1.6)*.5*ra;
      const ts=sectionStart(i.t,bar);if(ts!==null){const a=(i.t-ts)/1000/sp;if(a>=0&&a<6)U.uSurge.value.set(a,.6*smooth(a/.3)*Math.exp(-a*.3)*ra);}}
    for(let k=0;k<4;k++)U.uRip.value[k].set(rip[k*4],rip[k*4+1],rip[k*4+2],0);
    curtainGeometry(curtains.length,qi);
    // the ambient layers verified milestones unlock: airglow, the Milky Way, diamond dust, hoarfrost
    const un=k=>i.unlocks[k]?.level||0;skyU.uAG.value=clamp(num(sk.airglow,.5),0,1.6)*(1+1.4*un(0));skyU.uMW.value=clamp(num(sk.milkyWay,.8),0,1.6)*(1+.6*un(1))*(qi<3?1:0);U.uFrost.value=un(3)*clamp(i.overrides.atmosphere??1,0,2);
    nFx=0;nRib=0;writeCurtains(i);slots(i);writeScene(i);updateAgents(i);diamondDust(i,un(2));fx.commit(nFx);rib.commit(nRib);
    stars.material.uniforms.uStarK.value=clamp(num(sk.stars,1),0,1.6)*(1-.35*breakNow);starGeo.setDrawRange(0,QUALITY[qi].stars);
    stormNow=0;for(const c of curtains)stormNow=Math.max(stormNow,c.storm);
    lightOf(i);
  }
  // diamond dust (unlock): ice crystals glinting in the air near the shore
  function diamondDust(i,k){if(k<=0)return;const tv=i.tview,n=Math.round(140*k*clamp(i.overrides.atmosphere??1,0,2));
    for(let j=0;j<n;j++){const r1=rand(hash(`dust/${seed}/${j}`)),r2=rand(hash(`dust/${seed}/${j}/b`)),r3=rand(hash(`dust/${seed}/${j}/c`)),ph=r3*TAU;
      const x=camPos.x+(r1-.5)*40+Math.sin(tv*.07+ph)*3,z=camPos.z-6-r2*36,y=1+((r3*9+tv*.15)%7);
      point([x,y,z],pal.highlight,.5*Math.pow(Math.max(0,Math.sin(tv*1.3+ph*5)),16)*k,2+2*r2,8);}}
  // The aurora's light: on the snow, the mountains and the air (the sky's lobes), from the curtains' brightness and colour.
  const aurL=new THREE.Vector3(),tmpV=new THREE.Vector3(),lobeOrder=[];
  function lightOf(i){aurL.set(0,0,0);let wx=0,wsum=0;lobeOrder.length=0;
    for(const c of curtains){const lo=curtainColor(c.id,c.rank),sz=c.len*c.H/(c.R*c.R),k=c.bright*sz;aurL.x+=lo[0]*k;aurL.y+=lo[1]*k;aurL.z+=lo[2]*k;wx+=Math.sin(c.az)*k;wsum+=k;lobeOrder.push([k,c]);}
    if(coronaNow+breakNow>0){const C0=coronaColors()[0],k=(coronaNow+breakNow*1.5)*.45;aurL.x+=C0[0]*k;aurL.y+=C0[1]*k;aurL.z+=C0[2]*k;}
    aurL.multiplyScalar(.2);U.uAurL.value.copy(aurL);U.uAurD.value.set(wsum?wx/wsum:0,.45,-1).normalize();
    U.uSkyAmb.value.copy(V3(pal.haze,.7)).add(new THREE.Vector3(.005,.007,.014));
    lobeOrder.sort((a,b)=>b[0]-a[0]);let n=0;
    for(const [k,c] of lobeOrder.slice(0,8)){const p=at3(c,0,c.H*.04),d=tmpV.set(p[0]-camPos.x,p[1]-camPos.y,p[2]-camPos.z).normalize(),lo=curtainColor(c.id,c.rank);
      const size=clamp(Math.atan2(c.len,c.R)*.55,.05,.6);skyU.uLobe.value[n].set(d.x,d.y,d.z,size*size*1.4);skyU.uLobeC.value[n].set(lo[0],lo[1],lo[2],.022*c.bright*Math.min(1.5,k*40+.3));n++;}
    if(coronaNow+breakNow>0&&n<8){const C0=coronaColors()[0];skyU.uLobe.value[n].set(...MAG,.2);skyU.uLobeC.value[n].set(C0[0],C0[1],C0[2],.006*(coronaNow+breakNow*1.6));n++;}
    // the air toward the far mountains: the horizon's own glow (the sky's colour there, and the aurora's light in it)
    skyU.uNL.value=n;U.uHazeC.value.copy(V3(pal.haze,1.15)).addScaledVector(aurL,.55);}
  // ---- Camera: from the shore, low and wide across the lake toward the sky; events lean toward their curtain -------------
  // The rig eases a target D ahead of the shore along the view; afterCamera puts the camera back on the shore (camPos) looking
  // at the rig's target, so it never leaves the shore however the rig's springs meet.
  const D=400,VANTAGE={shore:{h:3.1,fov:1},low:{h:1.35,fov:.97},wide:{h:6.4,fov:1.12}};
  const goalPos=new THREE.Vector3(),dirV=new THREE.Vector3(),tmp=new THREE.Vector3();
  // Where the camera stands on the shore at a moment, breathing slowly (a pure function of the frame: everything that
  // places itself relative to the camera reads it from here, never from the camera the previous frame left).
  function shoreAt(i,out){const tv=i.tview,drift=clamp(num(cam.drift,.7),0,1.6)*clamp(i.overrides?.motion??1,0,2),own=VANTAGE[cam.personality]||VANTAGE.shore;
    return out.set(1.4*Math.sin(tv/61)*drift,own.h+.14*Math.sin(tv*.19)*drift,6+.9*Math.sin(tv/47)*drift);}
  function cameraGoal(i){
    const tv=i.tview,aspect=camera.aspect||16/9,portrait=aspect<1,motion=clamp(i.overrides.motion??1,0,2),drift=clamp(num(cam.drift,.7),0,1.6)*motion;
    const own=VANTAGE[cam.personality]||VANTAGE.shore;
    shoreAt(i,goalPos);
    // the view: toward the curtains' brightness-weighted middle, the horizon low in the frame (a tall sky over its
    // reflection); breathing slowly while nothing happens
    let wx=0,ws=0;for(const c of curtains){const k=c.bright*c.len;wx+=c.az*k;ws+=k;}
    let yaw=clamp(ws?wx/ws:0,-.35,.35)*(portrait?.25:.6)+.045*Math.sin(tv/97)*drift,fovL=clamp(num(cam.fov,56),40,72)*own.fov;
    const vf=portrait?2*Math.atan(Math.tan(Math.atan(Math.tan(fovL*Math.PI/360)*(16/9))*.5)/aspect)*180/Math.PI:fovL;
    const half=vf*Math.PI/360;let pitch=Math.atan(Math.tan(half)*(portrait?.1:.18))+clamp(num(cam.elevation,.45),0,1.2)*.05+.012*Math.sin(tv/71)*drift,fov=vf;
    // what changed is seen up close: its curtain, the camera leaning toward it and closing in a little
    const att=ctx.director.attentionAt(i.t,2),since=att?(i.t-att.at)/ctx.speed()/1000:Infinity;let k=0;
    const tch=touches.find(x=>x.kind==='edit'&&x.k>.2&&files.has(x.fileId));
    const lean=(p,kk,close)=>{dirV.set(p[0]-goalPos.x,p[1]-goalPos.y,p[2]-goalPos.z).normalize();const y2=Math.atan2(dirV.x,-dirV.z),p2=Math.asin(clamp(dirV.y,-1,1));
      yaw=lerp(yaw,y2,kk*.55);pitch=lerp(pitch,Math.max(pitch,p2-half*.35),kk*.45);fov=lerp(fov,fov*close,kk);};
    if(coronaNow>.01||breakNow>.01){const kk=smooth(Math.max(coronaNow,breakNow)*1.4);pitch=lerp(pitch,portrait?.58:.95,kk);yaw=lerp(yaw,0,kk*.7);fov=lerp(fov,fov*(breakNow>coronaNow?1.1:1.04),kk);k=kk;}
    else if(tch){const f=files.get(tch.fileId),kt=smooth(tch.age/.5)*(1-smooth((tch.age-2.6)/.6));lean(footOf(f,f.h*.4),kt*.8,.86);k=kt;}
    else if(att&&since<12){const p=attentionPoint(att);if(p){const kk=smooth(since/1.3)*(1-smooth((since-8)/4))*clamp(i.overrides.intensity??1,.4,1)*.85;lean(p,kk,.88);k=kk;}}
    if(k<.01){const busy=i.agents.map(a=>workOf(a,i.t)).find(Boolean);if(busy&&files.has(busy)){const f=files.get(busy);lean(footOf(f,f.h*.4),.35,.95);}}
    for(const x of widens){const a=(i.t-x.at)/1000/ctx.speed();if(a>=0&&a<6)fov*=1+.06*x.s*smooth(a/.8)*(1-smooth((a-3)/3));}
    dirV.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
    const target=goalPos.clone().addScaledVector(dirV,D);
    return {target,distance:D,azimuth:Math.atan2(-dirV.z,-dirV.x),elevation:-pitch,fov:clamp(fov,24,110),omega:k>.01?1:.6};
  }
  function attentionPoint(c){const s=c.subject||{};let f=null;
    if(s.fileId&&files.has(s.fileId))f=files.get(s.fileId);else{for(const id of s.fileIds||[])if(files.has(id)){f=files.get(id);break;}}
    if(f)return footOf(f,f.h*.4);
    if(s.groupId){const c2=curtains.find(q=>q.id===s.groupId);if(c2)return at3(c2,0,c2.H*.3);}
    return null;}
  const fwd=new THREE.Vector3();
  function afterCamera(i){camera.updateMatrixWorld();
    // the camera stands on the shore, looking at the rig's eased target
    camera.getWorldDirection(fwd);tmp.copy(camera.position).addScaledVector(fwd,D);camera.position.copy(goalPos);camera.lookAt(tmp);camera.updateMatrixWorld();
    // the stars and the Milky Way wheel about the pole (ambient: the view time)
    const ang=(i?.tview||0)*.0042*clamp(num(sk.wheel,.9),0,1.6)+rand(seed+9)*TAU;tmpM.makeRotationAxis(POLE,ang).multiply(galaxy);skyRotT.setFromMatrix4(tmpM);skyRot.copy(skyRotT).transpose();
    skyU.uInv.value.copy(camera.projectionMatrixInverse).premultiply(camera.matrixWorld);skyU.uCam.value.copy(camera.position);}
  // The reflection pass runs inside the measured frame: from background() when the host asks for the sky.
  const clearTmp=new THREE.Color();
  function renderReflection(){const q=clamp(Math.round(info.quality||0),0,3),dv=QUALITY[q].refl,[w,h]=ctx.pipeline.size,rw=Math.max(2,Math.round(w/dv)),rh=Math.max(2,Math.round(h/dv));
    if(reflRT.width!==rw||reflRT.height!==rh)reflRT.setSize(rw,rh);
    const prev=renderer.getRenderTarget(),pc=renderer.getClearColor(clearTmp),pa=renderer.getClearAlpha();
    // only the frame below the horizon shows the ice (and so its reflection): the pass draws there, or nowhere
    const hy=horizonY();if(hy<=0)return;const sh=Math.min(rh,Math.ceil(hy*rh+rh*.04));
    const px=U.uPx.value;U.uPx.value=px/dv;U.uRes.value.set(rw,rh);
    mir.value=-1;renderer.setRenderTarget(reflRT);renderer.setClearColor(0x000000,1);reflRT.scissor.set(0,0,rw,sh);reflRT.scissorTest=true;renderer.clear(true,true,false);renderer.render(mirrorScene,camera);
    reflRT.scissorTest=false;mir.value=1;U.uPx.value=px;U.uRes.value.set(w,h);renderer.setRenderTarget(prev);renderer.setClearColor(pc,pa);}
  // The share of the frame's height below the horizon (0 when the camera looks so far up that no ice is in view).
  const hz=new THREE.Vector3();
  function horizonY(){camera.getWorldDirection(fwd);const f=Math.hypot(fwd.x,fwd.z)||1;let lo=1;
    for(const a of [-1.2,0,1.2]){const c=Math.cos(a),sn=Math.sin(a),dx=(fwd.x*c-fwd.z*sn)/f,dz=(fwd.x*sn+fwd.z*c)/f;hz.set(camera.position.x+dx*3000,0,camera.position.z+dz*3000).project(camera);
      if(hz.z<1)lo=Math.min(lo,hz.y);}
    return clamp((lo+1)/2+.02,0,1);}
  function background(){if(renderer)renderReflection();return sky;}
  function grade(i){
    const inten=i.overrides.intensity??1,sec=i.mood?.section,sp=ctx.speed();
    let flash=0;for(const s of breakups){const a=(i.t-s.at)/1000/sp;if(s.full&&a>=0&&a<3)flash+=.05*Math.exp(-a*1.4)*(s.grand?1.5:1);}
    for(const s of coronas){const a=(i.t-s.at)/1000/sp;if(a>=0&&a<2.5)flash+=.015*Math.exp(-a*1.6);}
    const tint=new THREE.Vector3(1,1,1);if(sec==='tension')tint.set(1.02,.98,1);else if(sec==='resolve')tint.set(.98,1.01,1.03);
    tint.lerp(new THREE.Vector3(1.04,.95,.97),stormNow*.35);
    return {tonemap:'agx',bloom:clamp(num(LT.bloom,1),.3,2)*.72*(1+.35*breakNow+.15*coronaNow),threshold:clamp(num(LT.bloomThreshold,.65),.5,.9)*1.25,
      exposure:(1+(clamp(num(LT.exposure,1.05),.4,2.2)-1)*.5)*1.15*(1+.12*breakNow)*(sec==='breath'?.97:sec==='lift'?1.03:1),
      contrast:clamp(num(LT.contrast,1),.85,1.3)*1.04,saturation:1.06*(1-.08*stormNow),vignette:num(LT.vignette,.3)*1.1,grain:num(LT.grain,.025)*.55,
      flash:flash*inten,tint,aberration:.0012,bloomTint:{x:.92,y:1,z:.96},streak:.03};
  }
  // ---- Words -------------------------------------------------------------------------------------------------------------
  const role=id=>M().districts.get(id)?.role||model.districts.get(id)?.role||'logic';
  const MILESTONE={'first-validation':'First validation','integration-validated':'Integration validated','recovery':'Recovery','refactor':'Refactor validated'};
  const milestoneWords=c=>(c.detail?.kinds||[]).map(x=>MILESTONE[x]||x).join(' · ');
  const breakupOf=c=>breakups.find(s=>s.at===c.at);
  const plural=(n,w,ws=`${w}s`)=>`${n} ${n===1?w:ws}`;
  const curtainOfFile=id=>files.get(id)?.curtain?.id||null;
  const centre=()=>{const c=curtains[0];return c?new THREE.Vector3(...at3(c,0,c.H*.3)):new THREE.Vector3(0,400,-1300);};
  function describe(c,i){const s=c.subject||{},d=c.detail||{},n=(s.fileIds||[]).length,p=attentionPoint(c),pos=p?new THREE.Vector3(...p):centre();
    switch(c.intent){
      case 'subsystem.created':return {text:'A new curtain kindles',sub:s.groupId?`${ctx.name(s.groupId)} · ${role(s.groupId)}`:'',position:pos};
      case 'module.created':return {text:'A new ray ignites in its curtain',sub:s.groupId?`${ctx.name(s.groupId)}`:'',position:pos};
      case 'structure.created':return {text:'The ray grows',sub:Object.entries(d.kinds||{}).filter(([k])=>k!=='variable').map(([k,v])=>`${v} ${k.replace('ui.component','component').replace('api.route','route')}`).join(' · ')||plural(d.count||1,'symbol'),position:pos};
      case 'structure.removed':return {text:'The ray fades',sub:'structure removed',position:pos};
      case 'subsystem.connected':{const a=s.fileId?curtainOfFile(s.fileId):null,b=s.targetId?curtainOfFile(s.targetId):null;
        return {text:d.first?'Integration · a field line joins two curtains':'The field line between two curtains carries more',sub:a&&b?`${ctx.name(a)} → ${ctx.name(b)}`:'',position:pos};}
      case 'validation.failed':return {text:`Tests fail · the curtain turns storm-red over ${plural(n,'ray')}`,sub:'observed failing run',position:pos,color:'#ff7a8a'};
      case 'validation.passed':return {text:`Tests pass · pulsating light sweeps ${plural(n,'ray')}`,sub:'observed passing run',position:pos,color:'#8dffd8'};
      case 'validation.recovered':return {text:'Recovered · the sky gathers into a corona',sub:'the tests pass again',position:pos,color:'#8dffd8',banner:'Recovery',bannerSub:'the tests pass again'};
      case 'refactor.validated':return {text:'Refactor validated · the curtain settles',sub:`${plural(d.removedSymbols||0,'symbol')} removed · a candle stays on the shore`,position:pos,banner:'Refactor validated',bannerSub:'verified by a passing test run'};
      case 'milestone.achieved':{const k=milestoneWords(c),b=breakupOf(c);return {text:`${b?.full?'Auroral breakup':'The curtain brightens'} · ${k}`,sub:'verified by a passing test run · a lantern stays on the shore',position:pos,banner:k,bannerSub:'milestone · verified by a passing test run'};}
      case 'repository.checkpoint':return {text:'Committed · a meteor crosses the sky',sub:n?`commit observed · ${plural(n,'file')}`:'commit observed',position:pos};
      case 'world.expanded':return {text:`The sky widens · chapter ${d.chapter}`,sub:'accumulated structure',position:pos};
      case 'agent.collision':return {text:'Two agents meet at one ray',sub:(d.providers||[]).map(id=>presence(id).display).join(' · '),position:pos};
      default:return null;}}
  function agentPosition(id){return agentState.get(id)?.pos||null;}
  function agentColor(a){return '#'+agentCol[seatOf(a)].getHexString();}
  // Labels under each curtain's lower edge, at its middle.
  function subsystemLabels(){return curtains.map(c=>({position:new THREE.Vector3(...at3(c,0,-c.H*.06)),text:ctx.name(c.id),sub:`${role(c.id)} · ${plural(c.files.length,'ray')}`}));}
  function status(){const s=lastStats;return s.stressed?`${plural(s.stressed,'ray')} in a storm`:s.validated?`${s.validated} validated`:'';}
  function pick(x,y,cm){let best=null,bd=.04;const v=new THREE.Vector3();
    for(const [id,f] of files){for(const hk of [.1,.4]){v.set(...footOf(f,f.h*hk)).project(cm);const d=Math.hypot(v.x-x,(v.y-y)*.7);if(v.z<1&&d<bd){bd=d;best=id;}}}
    if(!best)for(const c of curtains){v.set(...at3(c,0,c.H*.3)).project(cm);const d=Math.hypot(v.x-x,(v.y-y)*.7);if(v.z<1&&d<bd*4){bd=d/4;best=`c:${c.id}`;}}
    return best;}
  function inspect(id,i){if(!id)return null;
    if(id.startsWith('c:')){const c=curtains.find(q=>q.id===id.slice(2));if(!c)return null;return {position:new THREE.Vector3(...at3(c,0,c.H*.3)),text:`${ctx.name(c.id)} · a curtain of the aurora`,sub:`${role(c.id)} · ${plural(c.files.length,'ray')}`};}
    const f=files.get(id),m=M().modules.get(id);if(!f||!m)return null;let n=0;for(const r of arcsAt(i||info))if(r.a.id===id||r.b.id===id)n++;
    return {position:new THREE.Vector3(...footOf(f,f.h*.4)),text:`A ray of ${ctx.name(f.curtain.id)} · ${M().stateAt(m,(i||info).t)}`,sub:`${plural(Math.round(f.n),'symbol')} · ${plural(n,'field line')}`};}
  function stats(){return {curtains:curtains.length,rays:files.size,history:!!hist,arcs:lastStats.arcs||0,lanterns:lastStats.lanterns||0,breakups:breakups.filter(s=>s.full).length,
    lastBreakup:breakups.length?(breakups.at(-1).full?'breakup':'local'):null,corona:+coronaNow.toFixed(2),breakup:+breakNow.toFixed(2),storm:+stormNow.toFixed(2),travel:travelNow,fieldTravel:lineNow,touches:touches.length,
    tethers:lastStats.tethers||0,meteors:lastStats.meteors||0,fx:nFx,ribbons:nRib,vertices:curtainMesh?curtainMesh.geometry.attributes.aC.count:0};}
  function rebuild(){hist=null;prep=null;prepKey='';lnSig='';jMid.clear();jT=null;}
  function dispose(){const objs=[];scene.traverse(o=>{if(o!==scene)objs.push(o);});for(const o of objs){scene.remove(o);}mirrorScene.clear();curtainMesh?.geometry.dispose();for(const x of disposables)x.dispose?.();}
  // After a seek: no transient survives (lanterns come back from the director's record).
  function onPrime(){for(const l of [pulses,storms,coronas,settles,breakups,meteors,kindles,widens,meetings])l.length=0;agentState.clear();lnSig='';}
  // A replay's recorded windows (the host after a seek, or when this world loads into a replay): its model of the history,
  // so a curtain's place and its rays do not depend on where playback was sought from.
  function onHistory(entries,t){hist=historyFrom(entries,t);prep=null;prepKey='';}
  function onDelta(d,s,e){hist?.applyDelta(d,s,e);}
  function onCue(c,t){if(hist)recordCue(hist,c,t);}
  // Composition anchors (layers.js), read-only: the sky's curtains, the rays.
  const composeA={center:new THREE.Vector3(),extent:600,subsystems:[],active:{pos:new THREE.Vector3()},nodes:[],boundary:{radius:900,y:0}};
  function composeAnchors(i){composeA.center.copy(centre());composeA.subsystems=curtains.map(c=>({id:c.id,pos:new THREE.Vector3(...at3(c,0,c.H*.3)),size:c.len*.3}));
    composeA.nodes=[...files.values()].slice(0,64).map(f=>({pos:new THREE.Vector3(...footOf(f,f.h*.4))}));const att=i?ctx.director.attentionAt(i.t,1):null,p=att&&attentionPoint(att);composeA.active.pos.copy(p?new THREE.Vector3(...p):composeA.center);return composeA;}
  return {framesPortrait:true,rebuild,update,afterCamera,background,grade,cameraGoal,effect,describe,agentPosition,agentColor,subsystemLabels,status,pick,inspect,stats,dispose,onPrime,onHistory,onDelta,onCue,
    compose:{camera,scene,anchors:composeAnchors}};
}
function rngOf(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}

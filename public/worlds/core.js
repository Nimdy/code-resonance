// Shared rendering core for the generative worlds: an HDR pipeline (scene -> bloom -> grade), GLSL noise, a damped
// cinematic camera rig, effect resource pools and a 2D overlay for labels. Every animation reads the performance clock
// passed in by the caller; nothing here reads wall-clock time, so a film renders identically on any machine.
import * as THREE from '../vendor/three.module.min.js';
export {THREE};
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const lerp=(a,b,t)=>a+(b-a)*t;
export const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export const easeOut=x=>1-Math.pow(1-clamp(x),3);
export const easeInOut=x=>{x=clamp(x);return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;};
export function hash(s){let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function rand(seed){let t=(seed>>>0)+0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
export function rng(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
export const color=c=>new THREE.Color(c);
// ---- GLSL ---------------------------------------------------------------------------------------------------------
// Gradient noise (Perlin-style, quintic fade) and fbm. Deterministic for a given input.
export const NOISE=`
vec3 nhash3(vec3 p){p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));return -1.+2.*fract(sin(p)*43758.5453123);}
float gnoise(vec3 p){vec3 i=floor(p),f=fract(p);vec3 u=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(mix(dot(nhash3(i),f),dot(nhash3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),mix(dot(nhash3(i+vec3(0,1,0)),f-vec3(0,1,0)),dot(nhash3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
             mix(mix(dot(nhash3(i+vec3(0,0,1)),f-vec3(0,0,1)),dot(nhash3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),mix(dot(nhash3(i+vec3(0,1,1)),f-vec3(0,1,1)),dot(nhash3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);}
float fbm3(vec3 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*gnoise(p);p=p*2.02+vec3(1.7,9.2,3.1);a*=.5;}return s;}
float fbm5(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*gnoise(p);p=p*2.03+vec3(5.2,1.3,7.7);a*=.5;}return s;}
float h11(float n){return fract(sin(n)*43758.5453123);}
`;
// ---- Post-processing --------------------------------------------------------------------------------------------
const QUAD_VS='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
function pass(fragmentShader,uniforms,defines=null){
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:QUAD_VS,fragmentShader,depthTest:false,depthWrite:false,...(defines?{defines}:{})});
  const scene=new THREE.Scene();scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));return {scene,material,uniforms};
}
// Bloom: soft-threshold prefilter, then a dual-filter downsample/upsample chain (cheap and wide), all half-float.
export function createPipeline(renderer,{samples=4}={}){
  let msaa=samples;
  const ortho=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const rtOpts={type:THREE.HalfFloatType,depthBuffer:false};
  const scene=new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType,samples});
  const background=new THREE.WebGLRenderTarget(4,4,rtOpts);
  const LEVELS=6,down=[],up=[];
  for(let i=0;i<LEVELS;i++){down.push(new THREE.WebGLRenderTarget(4,4,rtOpts));up.push(new THREE.WebGLRenderTarget(4,4,rtOpts));}
  const prefilter=pass(`varying vec2 vUv;uniform sampler2D src;uniform float threshold,knee;
    void main(){vec3 c=texture2D(src,vUv).rgb;float b=max(c.r,max(c.g,c.b));float soft=clamp(b-threshold+knee,0.,2.*knee);soft=soft*soft/(4.*knee+1e-4);
      float w=max(soft,b-threshold)/max(b,1e-4);gl_FragColor=vec4(min(c*w,vec3(64.)),1.);}`,{src:{value:null},threshold:{value:.7},knee:{value:.35}});
  const downPass=pass(`varying vec2 vUv;uniform sampler2D src;uniform vec2 px;
    void main(){vec3 s=texture2D(src,vUv).rgb*4.;s+=texture2D(src,vUv-px).rgb+texture2D(src,vUv+px).rgb+texture2D(src,vUv+vec2(px.x,-px.y)).rgb+texture2D(src,vUv-vec2(px.x,-px.y)).rgb;gl_FragColor=vec4(s/8.,1.);}`,
    {src:{value:null},px:{value:new THREE.Vector2()}});
  const upPass=pass(`varying vec2 vUv;uniform sampler2D src,base;uniform vec2 px;uniform float weight;
    void main(){vec3 s=texture2D(src,vUv+vec2(-px.x*2.,0.)).rgb+texture2D(src,vUv+vec2(-px.x,px.y)).rgb*2.+texture2D(src,vUv+vec2(0.,px.y*2.)).rgb+texture2D(src,vUv+px).rgb*2.
      +texture2D(src,vUv+vec2(px.x*2.,0.)).rgb+texture2D(src,vUv+vec2(px.x,-px.y)).rgb*2.+texture2D(src,vUv+vec2(0.,-px.y*2.)).rgb+texture2D(src,vUv-px).rgb*2.;
      gl_FragColor=vec4(texture2D(base,vUv).rgb+s/12.*weight,1.);}`,{src:{value:null},base:{value:null},px:{value:new THREE.Vector2()},weight:{value:1}});
  // Final grade: shockwave refraction, chromatic fringe, bloom (tinted: halation), anamorphic streaks, light shafts toward
  // up to two screen-space lights, exposure, tone mapping (ACES, or AgX: highlights roll off into colour instead of
  // clipping to white), contrast/saturation, vignette, grain. Every addition defaults to off, so a world (or a visual
  // pack) that does not ask for it renders exactly as before.
  // A finish (host.js FINISHES) draws with the same source compiled with FINISH defined: an optical lens instead of the
  // channel offset, a fringe on the bloom, halation, mist and split toning. Without FINISH the preprocessor leaves the
  // classic shader token for token, so a recipe without a finish renders bit for bit as before.
  const COMPOSITE=`varying vec2 vUv;uniform sampler2D src,bloom,wide;uniform float exposure,bloomStrength,contrast,saturation,vignette,grain,time,aberration,flash,tonemap,streak,rayDecay;
    uniform vec4 waves[4];uniform vec4 rays[2];uniform vec3 rayColor[2];uniform vec2 aspect;uniform vec3 lift,tint,bloomTint,streakTint;
#ifdef FINISH
    uniform float optical,fringe,halation,split,mist;uniform vec3 halationTint,splitShadow,splitHigh,mistTint;
    // Lateral chromatic aberration as a lens makes it: a short spectrum along the radius (red from outside, green at the
    // pixel, blue from inside, each channel a blend of taps, so an edge grades through its colours instead of splitting
    // into three outlines). The full fringe where light is bright; ordinary contrast edges keep about a third of it.
    vec3 lens(vec2 uv,vec2 o){
      vec3 a=texture2D(src,uv+o).rgb,b=texture2D(src,uv+o*.5).rgb,m=texture2D(src,uv).rgb,d=texture2D(src,uv-o*.5).rgb,e=texture2D(src,uv-o).rgb;
      vec3 f=vec3(a.r*.4+b.r*.35+m.r*.25,b.g*.2+m.g*.6+d.g*.2,m.b*.25+d.b*.35+e.b*.4);
      float k=smoothstep(.6,2.4,max(dot(a,vec3(.2126,.7152,.0722)),dot(e,vec3(.2126,.7152,.0722))));
      return mix(m,f,.38+.62*k);}
#endif
    vec3 aces(vec3 x){const float a=2.51,b=.03,c=2.43,d=.59,e=.14;return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.);}
    // Minimal AgX (Troy Sobotka's transform, polynomial fit by Benjamin Wrensch), punchy look; returns display-linear.
    vec3 agx(vec3 c){const mat3 m=mat3(.842479062253094,.0423282422610123,.0423756549057051,.0784335999999992,.878468636469772,.0784336,.0792237451477643,.0791661274605434,.879142973793104);
      const mat3 mi=mat3(1.19687900512017,-.0528968517574562,-.0529716355144438,-.0980208811401368,1.15190312990417,-.0980434501171241,-.0990297440797205,-.0989611768448433,1.15107367264116);
      c=m*max(c,vec3(1e-10));c=clamp((log2(c)+12.47393)/16.5,0.,1.);
      vec3 x2=c*c,x4=x2*x2;c=15.5*x4*x2-40.14*x4*c+31.96*x4-6.868*x2*c+.4298*x2+.1191*c-.00232;
      float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,1.15);c=pow(max(c,0.),vec3(1.35));
      return clamp(pow(max(mi*c,0.),vec3(2.2)),0.,1.);}
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){vec2 uv=vUv;
      for(int i=0;i<4;i++){vec4 w=waves[i];if(w.w<=0.)continue;vec2 d=(uv-w.xy)*aspect;float r=length(d);float band=exp(-pow((r-w.z)*18.,2.));uv-=normalize(d+1e-5)/aspect*band*w.w*.035;}
#ifdef FINISH
      // The offset grows smoothly from nothing at the centre to optical (a share of the image height) in the corners,
      // isotropic in pixels and flattening at the frame's edge (no smear where the image ends).
      vec2 c=uv-.5,pc=c*aspect;float rad=min(1.,length(pc)/length(aspect*.5));
      vec2 off=pc/max(length(pc),1e-4)/aspect*optical*rad*rad*(3.-2.*rad);
      vec3 col=lens(uv,off);
      // The bloom through the same lens (its colours separate a little more, as a halo's do), halation (the tight part of
      // the glow hugging the highlights, half its own colour and half film's warmth whatever the light's colour) and
      // mist (the wide glow laid softly over the image).
      vec3 bl=texture2D(bloom,uv).rgb,wd=texture2D(wide,uv).rgb;if(fringe>0.)bl=vec3(texture2D(bloom,uv+off*fringe).r,bl.g,texture2D(bloom,uv-off*fringe).b);
      col+=bl*bloomStrength*.22*bloomTint;
      vec3 tight=max(bl-wd,0.);tight=mix(tight,vec3(dot(tight,vec3(.2126,.7152,.0722))),.5);
      col+=tight*halation*halationTint*bloomStrength*.22+wd*mist*mistTint*.35;
#else
      vec2 c=uv-.5;float edge=dot(c,c);
      vec3 col=vec3(texture2D(src,uv+c*aberration*edge).r,texture2D(src,uv).g,texture2D(src,uv-c*aberration*edge).b);
      col+=texture2D(bloom,uv).rgb*bloomStrength*.22*bloomTint;
#endif
      // Anamorphic streak: the wide bloom level stretched horizontally (a lens's horizontal flare on bright points).
      if(streak>0.){vec3 st=vec3(0.);for(int k=-6;k<=6;k++){float o=float(k)/6.;st+=texture2D(wide,uv+vec2(o*.22,0.)).rgb*exp(-abs(o)*3.);}col+=st/5.*streak*streakTint;}
      // Light shafts: the bloom gathered along the line toward each light (screen-space god rays).
      for(int r=0;r<2;r++){vec4 L=rays[r];if(L.z<=0.)continue;vec2 d=(L.xy-uv)/24.;vec2 q=uv;float w=1.;vec3 acc=vec3(0.);
        for(int k=0;k<24;k++){q+=d;acc+=texture2D(wide,q).rgb*w;w*=rayDecay;}col+=acc/24.*L.z*rayColor[r];}
      col*=exposure*(1.+flash*.6);col=tonemap>.5?agx(col*tint):aces(col*tint);
      col=pow(col,vec3(1./2.2));
      float l=dot(col,vec3(.2126,.7152,.0722));col=mix(vec3(l),col,saturation);col=(col-.5)*contrast+.5+lift;
#ifdef FINISH
      // Split toning: the shadows lean one way and the highlights the other (hue only: the offsets carry no luminance),
      // black and white stay neutral.
      if(split>0.){float y=clamp(dot(col,vec3(.2126,.7152,.0722)),0.,1.),hw=smoothstep(.42,.95,y);col+=split*(splitShadow*(1.-hw)*smoothstep(0.,.2,y)*(1.-y)+splitHigh*hw*(1.-y*.6));}
#endif
      col*=1.-vignette*smoothstep(.15,.9,length(c*vec2(1.15,1.)));
      col+=(h(vUv*vec2(1920.,1080.)+fract(time*.731)*vec2(37.,91.))-.5)*grain;
      gl_FragColor=vec4(clamp(col,0.,1.),1.);}`;
  const composite=pass(COMPOSITE,
    {src:{value:null},bloom:{value:null},exposure:{value:1},bloomStrength:{value:1},contrast:{value:1},saturation:{value:1.05},vignette:{value:.3},grain:{value:.025},
     time:{value:0},aberration:{value:.004},flash:{value:0},waves:{value:[0,1,2,3].map(()=>new THREE.Vector4())},aspect:{value:new THREE.Vector2(1,1)},lift:{value:new THREE.Vector3()},tint:{value:new THREE.Vector3(1,1,1)},
     wide:{value:null},tonemap:{value:0},streak:{value:0},streakTint:{value:new THREE.Vector3(1,1,1)},bloomTint:{value:new THREE.Vector3(1,1,1)},
     rays:{value:[new THREE.Vector4(),new THREE.Vector4()]},rayColor:{value:[new THREE.Vector3(1,1,1),new THREE.Vector3(1,1,1)]},rayDecay:{value:.96},
     optical:{value:0},fringe:{value:0},halation:{value:0},split:{value:0},mist:{value:0},halationTint:{value:new THREE.Vector3(1,.4,.18)},splitShadow:{value:new THREE.Vector3()},
     splitHigh:{value:new THREE.Vector3()},mistTint:{value:new THREE.Vector3(1,1,1)}});
  // The finished composite shares the classic one's uniforms; compiled the first time a finish is drawn.
  let finished=null;const finishPass=()=>finished||(finished=pass(COMPOSITE,composite.uniforms,{FINISH:''}));
  let width=4,height=4;
  // Optional full-screen passes on the HDR scene before bloom (visual packs): ping-pong half-float targets.
  // The targets exist only while passes are set, so worlds without post-processing pay nothing for them.
  let post=[],postTargets=[];
  const postScene=new THREE.Scene(),postMesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2));postMesh.frustumCulled=false;postScene.add(postMesh);
  function setPost(materials){post=materials||[];
    if(post.length&&!postTargets.length)postTargets=[0,1].map(()=>{const t=new THREE.WebGLRenderTarget(4,4,rtOpts);t.setSize(width,height);return t;});
    if(!post.length&&postTargets.length){for(const t of postTargets)t.dispose();postTargets=[];}}
  function setSamples(n){if(n===msaa)return;msaa=n;scene.samples=n;scene.dispose();}
  function setSize(w,h){
    width=w;height=h;scene.setSize(w,h);for(const t of postTargets)t.setSize(w,h);background.setSize(Math.max(1,w>>1),Math.max(1,h>>1));
    let x=Math.max(1,w>>1),y=Math.max(1,h>>1);for(let i=0;i<LEVELS;i++){down[i].setSize(x,y);up[i].setSize(x,y);x=Math.max(1,x>>1);y=Math.max(1,y>>1);}
    composite.uniforms.aspect.value.set(w/Math.max(1,h),1);
  }
  // Grade options: tonemap 'aces' (default) | 'agx'; streak (0 = off) with streakTint; bloomTint (halation colour);
  // rays: up to two {x, y (0..1 screen), strength, color: THREE.Color|Vector3} light shafts, rayDecay (0.9..0.99).
  // finish: true draws the finished composite with optical (the lens's fringe in the corners, a share of the image
  // height), fringe (the bloom's, × optical), halation with halationTint, split toning (splitShadow / splitHigh: hue
  // offsets) and mist with mistTint; `aberration` is then unused.
  function render(drawScene,{bloom=1,threshold=.7,exposure=1,contrast=1,saturation=1.05,vignette=.3,grain=.025,time=0,flash=0,waves=[],lift=null,tint=null,aberration=.004,
    tonemap='aces',streak=0,streakTint=null,bloomTint=null,rays=[],rayDecay=.96,finish=false,optical=0,fringe=0,halation=0,halationTint=null,split=0,splitShadow=null,splitHigh=null,mist=0,mistTint=null}={}){
    renderer.setRenderTarget(scene);renderer.setClearColor(0x000000,1);renderer.clear(true,true,true);drawScene(scene);
    let hdr=scene.texture;
    post.forEach((m,i)=>{const target=postTargets[i%2];if(m.uniforms.tInput)m.uniforms.tInput.value=hdr;if(m.uniforms.uRes)m.uniforms.uRes.value.set(width,height);
      postMesh.material=m;renderer.setRenderTarget(target);renderer.render(postScene,ortho);hdr=target.texture;});
    prefilter.uniforms.src.value=hdr;prefilter.uniforms.threshold.value=threshold;
    renderer.setRenderTarget(down[0]);renderer.render(prefilter.scene,ortho);
    for(let i=1;i<LEVELS;i++){downPass.uniforms.src.value=down[i-1].texture;downPass.uniforms.px.value.set(1/down[i-1].width,1/down[i-1].height);renderer.setRenderTarget(down[i]);renderer.render(downPass.scene,ortho);}
    let src=down[LEVELS-1];
    for(let i=LEVELS-2;i>=0;i--){upPass.uniforms.src.value=src.texture;upPass.uniforms.base.value=down[i].texture;upPass.uniforms.px.value.set(.5/src.width,.5/src.height);upPass.uniforms.weight.value=1;
      renderer.setRenderTarget(up[i]);renderer.render(upPass.scene,ortho);src=up[i];}
    const u=composite.uniforms;u.src.value=hdr;u.bloom.value=up[0].texture;u.aberration.value=aberration;
    Object.assign(u.bloomStrength,{value:bloom});u.exposure.value=exposure;u.contrast.value=contrast;u.saturation.value=saturation;u.vignette.value=vignette;u.grain.value=grain;u.time.value=time;u.flash.value=flash;
    for(let i=0;i<4;i++){const w=waves[i];if(w)u.waves.value[i].set(w.x,w.y,w.r,w.a);else u.waves.value[i].set(0,0,0,0);}
    if(lift)u.lift.value.copy(lift);else u.lift.value.set(0,0,0);if(tint)u.tint.value.copy(tint);else u.tint.value.set(1,1,1);
    u.wide.value=up[2].texture;u.tonemap.value=tonemap==='agx'?1:0;u.streak.value=streak;u.rayDecay.value=rayDecay;
    u.streakTint.value.set(1,1,1);if(streakTint)u.streakTint.value.set(streakTint.x??streakTint.r,streakTint.y??streakTint.g,streakTint.z??streakTint.b);
    u.bloomTint.value.set(1,1,1);if(bloomTint)u.bloomTint.value.set(bloomTint.x??bloomTint.r,bloomTint.y??bloomTint.g,bloomTint.z??bloomTint.b);
    for(let i=0;i<2;i++){const r=rays[i];if(r&&r.strength>0){u.rays.value[i].set(r.x,r.y,r.strength,0);const c=r.color;u.rayColor.value[i].set(c?.x??c?.r??1,c?.y??c?.g??1,c?.z??c?.b??1);}else u.rays.value[i].set(0,0,0,0);}
    if(finish){u.optical.value=optical;u.fringe.value=fringe;u.halation.value=halation;u.split.value=split;u.mist.value=mist;const v3=(t,x,d)=>t.set(x?.x??x?.r??d,x?.y??x?.g??d,x?.z??x?.b??d);
      v3(u.halationTint.value,halationTint,1);v3(u.splitShadow.value,splitShadow,0);v3(u.splitHigh.value,splitHigh,0);v3(u.mistTint.value,mistTint,1);}
    renderer.setRenderTarget(null);renderer.render((finish?finishPass():composite).scene,ortho);
  }
  // A background pass (nebula, sky) rendered at half resolution into its own target and drawn first into the scene.
  const bgScene=new THREE.Scene(),bgMesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2));bgMesh.frustumCulled=false;bgScene.add(bgMesh);
  function renderBackground(material){bgMesh.material=material;renderer.setRenderTarget(background);renderer.render(bgScene,ortho);return background.texture;}
  const backdrop=pass('varying vec2 vUv;uniform sampler2D src;void main(){gl_FragColor=vec4(texture2D(src,vUv).rgb,1.);}',{src:{value:null}});
  function drawBackdrop(texture){backdrop.uniforms.src.value=texture;renderer.render(backdrop.scene,ortho);}
  function dispose(){for(const t of [scene,background,...down,...up,...postTargets])t.dispose();for(const p of [prefilter,downPass,upPass,composite,finished,backdrop].filter(Boolean))p.material.dispose();bgMesh.geometry.dispose();postMesh.geometry.dispose();}
  return {setSize,setSamples,setPost,render,renderBackground,drawBackdrop,dispose,get size(){return [width,height];}};
}
export const BACKGROUND_VS='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
// ---- Camera ---------------------------------------------------------------------------------------------------
// A rig of critically damped springs (target, distance, azimuth, elevation, fov): attention shifts glide, never cut.
export function createCameraRig(camera){
  const s={target:new THREE.Vector3(),vt:new THREE.Vector3(),distance:20,vd:0,az:0,va:0,el:.4,ve:0,fov:camera.fov,vf:0,ready:false};
  const spring=(x,v,goal,omega,dt)=>{const f=1+2*dt*omega,oo=omega*omega,hoo=dt*oo,hhoo=dt*hoo,det=1/(f+hhoo);return [(f*x+dt*v+hhoo*goal)*det,(v+hoo*(goal-x))*det];};
  function update(dt,goal,{snap=false,omega=.9}={}){
    if(!s.ready||snap){s.target.copy(goal.target);s.distance=goal.distance;s.az=goal.azimuth;s.el=goal.elevation;s.fov=goal.fov||camera.fov;s.vt.set(0,0,0);s.vd=s.va=s.ve=s.vf=0;s.ready=true;}
    else{
      // Sub-steps keep the springs stable at any frame time.
      const steps=Math.max(1,Math.ceil(dt/(1/60)));const h=dt/steps;
      for(let i=0;i<steps;i++){
        for(const k of ['x','y','z']){const [x,v]=spring(s.target[k],s.vt[k],goal.target[k],omega,h);s.target[k]=x;s.vt[k]=v;}
        [s.distance,s.vd]=spring(s.distance,s.vd,goal.distance,omega*.8,h);
        let ga=goal.azimuth;while(ga-s.az>Math.PI)ga-=Math.PI*2;while(ga-s.az<-Math.PI)ga+=Math.PI*2;
        [s.az,s.va]=spring(s.az,s.va,ga,omega*.6,h);[s.el,s.ve]=spring(s.el,s.ve,goal.elevation,omega*.7,h);[s.fov,s.vf]=spring(s.fov,s.vf,goal.fov||camera.fov,omega*.5,h);
      }
    }
    const ce=Math.cos(s.el);
    camera.position.set(s.target.x+Math.cos(s.az)*ce*s.distance,s.target.y+Math.sin(s.el)*s.distance,s.target.z+Math.sin(s.az)*ce*s.distance);
    camera.lookAt(s.target);if(Math.abs(camera.fov-s.fov)>1e-3){camera.fov=s.fov;camera.updateProjectionMatrix();}
    return s;
  }
  return {update,state:s};
}
// ---- Overlay: labels, callouts, chips, banners (2D canvas over the WebGL canvas; composited into films) ----------
const FONT='Inter, "Segoe UI", system-ui, -apple-system, sans-serif';
export function createOverlay(){
  const items=[];
  const project=(camera,v,w,h)=>{const p=v.clone().project(camera);return {x:(p.x*.5+.5)*w,y:(-p.y*.5+.5)*h,visible:p.z<1&&p.z>-1};};
  function draw(g,w,h,list,scale=1){
    g.save();g.textBaseline='middle';
    for(const it of list){
      const a=clamp(it.alpha);if(a<=.01)continue;g.globalAlpha=a;
      if(it.kind==='banner'){
        g.font=`300 ${Math.round(46*scale)}px ${FONT}`;g.textAlign='center';g.fillStyle='rgba(250,246,238,.95)';g.shadowColor='rgba(0,0,0,.7)';g.shadowBlur=24*scale;
        g.fillText(it.text,w/2,h*.2);if(it.sub){g.font=`500 ${Math.round(17*scale)}px ${FONT}`;g.fillStyle='rgba(225,232,245,.8)';g.letterSpacing='3px';g.fillText(it.sub.toUpperCase(),w/2,h*.2+44*scale);}
        g.shadowBlur=0;continue;
      }
      if(it.kind==='title'){
        g.textAlign='left';g.shadowColor='rgba(0,0,0,.6)';g.shadowBlur=18*scale;
        g.font=`200 ${Math.round(58*scale)}px ${FONT}`;g.fillStyle='rgba(248,246,240,.96)';g.fillText(it.text,80*scale,h-150*scale);
        // The subtitle is left out where it would be under 11 px (small previews); films and the Stage at 1080p keep it.
        if(15*scale>=11){g.font=`500 ${Math.round(15*scale)}px ${FONT}`;g.fillStyle='rgba(220,228,240,.78)';g.fillText((it.sub||'').toUpperCase(),83*scale,h-102*scale);}g.shadowBlur=0;continue;
      }
      if(it.kind==='caption'){
        g.font=`500 ${Math.round(27*scale)}px ${FONT}`;g.textAlign='center';g.shadowColor='rgba(4,6,12,.95)';g.shadowBlur=18*scale;g.fillStyle='#eef3fb';
        g.fillText(it.text,w/2,h-88*scale);g.shadowBlur=0;continue;
      }
      if(it.kind==='callout'||it.kind==='chip'||it.kind==='label'){
        const x=it.x,y=it.y,lx=x+(it.dx??46)*scale,ly=y+(it.dy??-46)*scale;
        if(it.kind==='callout'){g.strokeStyle=it.color||'rgba(235,240,250,.7)';g.lineWidth=1.2*scale;g.beginPath();g.moveTo(x,y);g.lineTo(lx,ly);g.lineTo(lx+18*scale,ly);g.stroke();
          g.fillStyle=it.color||'#fff';g.beginPath();g.arc(x,y,3*scale,0,Math.PI*2);g.fill();}
        const size=it.kind==='label'?15:it.kind==='chip'?14:17;
        g.font=`${it.kind==='callout'?500:600} ${Math.round(size*scale)}px ${FONT}`;g.textAlign='left';
        const tx=it.kind==='callout'?lx+24*scale:x+(it.dx??14)*scale,ty=it.kind==='callout'?ly:y+(it.dy??0)*scale;
        if(it.kind==='chip'){const m=g.measureText(it.text).width;g.fillStyle='rgba(8,10,18,.55)';const r=11*scale;g.beginPath();g.roundRect(tx-8*scale,ty-r,m+16*scale+(it.dot?14*scale:0),r*2,r);g.fill();
          if(it.dot){g.fillStyle=it.dot;g.beginPath();g.arc(tx,ty,4*scale,0,Math.PI*2);g.fill();}}
        g.shadowColor='rgba(0,0,0,.85)';g.shadowBlur=8*scale;g.fillStyle=it.textColor||'rgba(244,247,252,.95)';g.fillText(it.text,tx+(it.kind==='chip'&&it.dot?12*scale:0),ty);
        if(it.sub){g.font=`500 ${Math.round(12*scale)}px ${FONT}`;g.fillStyle='rgba(210,220,236,.75)';g.fillText(it.sub.toUpperCase(),tx,ty+18*scale);}
        g.shadowBlur=0;
      }
      if(it.kind==='lower-third'){
        const y0=h-120*scale;g.fillStyle='rgba(6,8,14,.55)';g.fillRect(0,y0,w,120*scale);
        g.font=`600 ${Math.round(22*scale)}px ${FONT}`;g.textAlign='left';g.fillStyle='rgba(246,248,252,.96)';g.fillText(it.text,48*scale,y0+40*scale);
        g.font=`500 ${Math.round(16*scale)}px ${FONT}`;g.fillStyle='rgba(214,224,240,.82)';g.fillText(it.sub||'',48*scale,y0+78*scale);
        if(it.right){g.textAlign='right';g.fillText(it.right,w-48*scale,y0+40*scale);}
        if(it.right2){g.textAlign='right';g.fillText(it.right2,w-48*scale,y0+78*scale);}
      }
    }
    g.restore();
  }
  return {project,draw,items};
}
// ---- Pools: effects are pre-allocated and recycled, so repeated events never grow GPU memory ----------------------
export function pool(capacity,make){
  const all=Array.from({length:capacity},(_,i)=>make(i));let next=0;
  return {all,take(){const x=all[next];next=(next+1)%capacity;return x;}};
}
// ---- Buffers ------------------------------------------------------------------------------------------------------
// Instanced (or point) attribute storage that grows by doubling. Growing disposes the old GPU buffers first, so a
// long session never leaks; only attributes marked dirty are re-uploaded.
function buffers(geometry,layout,capacity,Attribute){
  const self={geometry,capacity:0,arrays:{},layout,dirtySet:new Set()};
  function alloc(cap){
    if(self.capacity)geometry.dispose();
    for(const [name,size] of Object.entries(layout)){
      const arr=new Float32Array(cap*size),old=self.arrays[name];if(old)arr.set(old.subarray(0,Math.min(old.length,arr.length)));
      self.arrays[name]=arr;const attr=new Attribute(arr,size);attr.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute(name,attr);
    }
    self.capacity=cap;for(const k of Object.keys(layout))self.dirtySet.add(k);
  }
  alloc(Math.max(1,capacity));
  self.ensure=n=>{if(n>self.capacity){let c=self.capacity;while(c<n)c*=2;alloc(c);}};
  self.write=(name,i,a=0,b=0,c=0,d=0)=>{const arr=self.arrays[name],s=layout[name],o=i*s;arr[o]=a;if(s>1)arr[o+1]=b;if(s>2)arr[o+2]=c;if(s>3)arr[o+3]=d;self.dirtySet.add(name);};
  self.dirty=name=>self.dirtySet.add(name);
  self.flush=()=>{for(const name of self.dirtySet){const a=geometry.attributes[name];if(a)a.needsUpdate=true;}self.dirtySet.clear();};
  return self;
}
export function instancedBuffers(base,layout,capacity=64){
  const geometry=new THREE.InstancedBufferGeometry();geometry.index=base.index;
  for(const [k,v] of Object.entries(base.attributes))geometry.setAttribute(k,v);
  const self=buffers(geometry,layout,capacity,THREE.InstancedBufferAttribute);
  const baseAttrs=base.attributes,baseIndex=base.index;
  const realloc=self.ensure;self.ensure=n=>{const before=self.capacity;realloc(n);if(self.capacity!==before){geometry.index=baseIndex;for(const [k,v] of Object.entries(baseAttrs))geometry.setAttribute(k,v);}};
  self.commit=count=>{geometry.instanceCount=count;self.flush();};
  return self;
}
export function pointBuffers(layout,capacity=64){
  const geometry=new THREE.BufferGeometry();
  const self=buffers(geometry,{position:3,...layout},capacity,THREE.BufferAttribute);
  self.commit=count=>{geometry.setDrawRange(0,count);self.flush();};
  return self;
}
// The shared orbit: a circle of radius r around c, phase ph advancing w rad/s, plane tilted about x then z.
// GLSL and JS versions must agree exactly: the GPU draws bodies, the CPU aims the camera and labels at them.
export const ORBIT=`
vec3 orbitPos(vec3 c,float r,float ph,float w,vec2 tilt,float tv){
  float a=ph+w*tv;vec3 p=vec3(cos(a)*r,0.,sin(a)*r);
  float ca=cos(tilt.x),sa=sin(tilt.x);p=vec3(p.x,p.y*ca-p.z*sa,p.y*sa+p.z*ca);
  float cb=cos(tilt.y),sb=sin(tilt.y);p=vec3(p.x*cb-p.y*sb,p.x*sb+p.y*cb,p.z);
  return c+p;}
`;
export function orbitPos(out,c,r,ph,w,tx,tz,tv){
  const a=ph+w*tv;let x=Math.cos(a)*r,y=0,z=Math.sin(a)*r;
  const ca=Math.cos(tx),sa=Math.sin(tx);const y1=y*ca-z*sa,z1=y*sa+z*ca;y=y1;z=z1;
  const cb=Math.cos(tz),sb=Math.sin(tz);const x2=x*cb-y*sb,y2=x*sb+y*cb;
  return out.set(c.x+x2,c.y+y2,c.z+z);
}

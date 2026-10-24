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
function pass(fragmentShader,uniforms){
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:QUAD_VS,fragmentShader,depthTest:false,depthWrite:false});
  const scene=new THREE.Scene();scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));return {scene,material,uniforms};
}
// Bloom: soft-threshold prefilter, then a dual-filter downsample/upsample chain (cheap and wide), all half-float.
export function createPipeline(renderer,{samples=4}={}){
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
  // Final grade: shockwave refraction, chromatic fringe, bloom, exposure, ACES, contrast/saturation, vignette, grain.
  const composite=pass(`varying vec2 vUv;uniform sampler2D src,bloom;uniform float exposure,bloomStrength,contrast,saturation,vignette,grain,time,aberration,flash;
    uniform vec4 waves[4];uniform vec2 aspect;uniform vec3 lift,tint;
    vec3 aces(vec3 x){const float a=2.51,b=.03,c=2.43,d=.59,e=.14;return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.);}
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){vec2 uv=vUv;
      for(int i=0;i<4;i++){vec4 w=waves[i];if(w.w<=0.)continue;vec2 d=(uv-w.xy)*aspect;float r=length(d);float band=exp(-pow((r-w.z)*18.,2.));uv-=normalize(d+1e-5)/aspect*band*w.w*.035;}
      vec2 c=uv-.5;float edge=dot(c,c);
      vec3 col=vec3(texture2D(src,uv+c*aberration*edge).r,texture2D(src,uv).g,texture2D(src,uv-c*aberration*edge).b);
      col+=texture2D(bloom,uv).rgb*bloomStrength*.22;
      col*=exposure*(1.+flash*.6);col=aces(col*tint);
      col=pow(col,vec3(1./2.2));
      float l=dot(col,vec3(.2126,.7152,.0722));col=mix(vec3(l),col,saturation);col=(col-.5)*contrast+.5+lift;
      col*=1.-vignette*smoothstep(.15,.9,length(c*vec2(1.15,1.)));
      col+=(h(vUv*vec2(1920.,1080.)+fract(time*.731)*vec2(37.,91.))-.5)*grain;
      gl_FragColor=vec4(clamp(col,0.,1.),1.);}`,
    {src:{value:null},bloom:{value:null},exposure:{value:1},bloomStrength:{value:1},contrast:{value:1},saturation:{value:1.05},vignette:{value:.3},grain:{value:.025},
     time:{value:0},aberration:{value:.004},flash:{value:0},waves:{value:[0,1,2,3].map(()=>new THREE.Vector4())},aspect:{value:new THREE.Vector2(1,1)},lift:{value:new THREE.Vector3()},tint:{value:new THREE.Vector3(1,1,1)}});
  let width=4,height=4;
  function setSize(w,h){
    width=w;height=h;scene.setSize(w,h);background.setSize(Math.max(1,w>>1),Math.max(1,h>>1));
    let x=Math.max(1,w>>1),y=Math.max(1,h>>1);for(let i=0;i<LEVELS;i++){down[i].setSize(x,y);up[i].setSize(x,y);x=Math.max(1,x>>1);y=Math.max(1,y>>1);}
    composite.uniforms.aspect.value.set(w/Math.max(1,h),1);
  }
  function render(drawScene,{bloom=1,threshold=.7,exposure=1,contrast=1,saturation=1.05,vignette=.3,grain=.025,time=0,flash=0,waves=[],lift=null,tint=null}={}){
    renderer.setRenderTarget(scene);renderer.setClearColor(0x000000,1);renderer.clear(true,true,true);drawScene(scene);
    prefilter.uniforms.src.value=scene.texture;prefilter.uniforms.threshold.value=threshold;
    renderer.setRenderTarget(down[0]);renderer.render(prefilter.scene,ortho);
    for(let i=1;i<LEVELS;i++){downPass.uniforms.src.value=down[i-1].texture;downPass.uniforms.px.value.set(1/down[i-1].width,1/down[i-1].height);renderer.setRenderTarget(down[i]);renderer.render(downPass.scene,ortho);}
    let src=down[LEVELS-1];
    for(let i=LEVELS-2;i>=0;i--){upPass.uniforms.src.value=src.texture;upPass.uniforms.base.value=down[i].texture;upPass.uniforms.px.value.set(.5/src.width,.5/src.height);upPass.uniforms.weight.value=1;
      renderer.setRenderTarget(up[i]);renderer.render(upPass.scene,ortho);src=up[i];}
    const u=composite.uniforms;u.src.value=scene.texture;u.bloom.value=up[0].texture;
    Object.assign(u.bloomStrength,{value:bloom});u.exposure.value=exposure;u.contrast.value=contrast;u.saturation.value=saturation;u.vignette.value=vignette;u.grain.value=grain;u.time.value=time;u.flash.value=flash;
    for(let i=0;i<4;i++){const w=waves[i];if(w)u.waves.value[i].set(w.x,w.y,w.r,w.a);else u.waves.value[i].set(0,0,0,0);}
    if(lift)u.lift.value.copy(lift);if(tint)u.tint.value.copy(tint);
    renderer.setRenderTarget(null);renderer.render(composite.scene,ortho);
  }
  // A background pass (nebula, sky) rendered at half resolution into its own target and drawn first into the scene.
  function renderBackground(material){
    if(!material.__quad){const s=new THREE.Scene();s.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));material.__quad=s;}
    renderer.setRenderTarget(background);renderer.render(material.__quad,ortho);return background.texture;
  }
  const backdrop=pass('varying vec2 vUv;uniform sampler2D src;void main(){gl_FragColor=vec4(texture2D(src,vUv).rgb,1.);}',{src:{value:null}});
  function drawBackdrop(texture){backdrop.uniforms.src.value=texture;renderer.render(backdrop.scene,ortho);}
  function dispose(){for(const t of [scene,background,...down,...up])t.dispose();for(const p of [prefilter,downPass,upPass,composite,backdrop])p.material.dispose();}
  return {setSize,render,renderBackground,drawBackdrop,dispose,get size(){return [width,height];}};
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
        g.font=`500 ${Math.round(15*scale)}px ${FONT}`;g.fillStyle='rgba(220,228,240,.78)';g.fillText((it.sub||'').toUpperCase(),83*scale,h-102*scale);g.shadowBlur=0;continue;
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

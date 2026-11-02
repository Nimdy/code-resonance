// Genesis field: the view. Draws the authoritative sheet of genesis-field.js and derives its fine detail on the GPU from
// the state it is handed (the sheet, its rest lengths, the field of phases): boundaries between phases that do not mix
// as titanium seams, intermingled boundaries as veined marbling, grown (and so thinned) matter as translucency to the
// lamp behind it. It reads the simulation and never writes to it, so what it draws cannot change what happens.
import {THREE} from './core.js';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
// Up to twelve phases, four per texture.
const MAXK=12,TEX=3;
const VS_HEAD=`attribute float aGrow;attribute float aCrest;varying vec2 vMat;varying float vGrow;varying float vCrest;varying vec3 vWorld;\n`;
const FS_HEAD=`
uniform sampler2D uPhase[${TEX}];uniform vec3 uTint[${MAXK}];uniform float uMix[${MAXK*MAXK}];uniform int uK;
uniform vec3 uMetal;uniform vec3 uLamp;uniform vec3 uBackDir;uniform float uBack;uniform vec3 uSeamGlow;uniform sampler2D uMap;uniform vec2 uSeat[${MAXK}];uniform float uBands;
uniform float uDebug;uniform float uFlowGlow;uniform vec3 uSunDir;uniform vec3 uSunColor;uniform float uTrans;
varying vec2 vMat;varying float vGrow;varying float vCrest;varying vec3 vWorld;
float gfW[${MAXK}];
vec2 gfHash(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return -1.+2.*fract(sin(p)*43758.5453123);}
float gfNoise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(dot(gfHash(i),f),dot(gfHash(i+vec2(1,0)),f-vec2(1,0)),u.x),mix(dot(gfHash(i+vec2(0,1)),f-vec2(0,1)),dot(gfHash(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y);}
void gfPhases(){
  vec4 a=texture2D(uPhase[0],vMat),b=texture2D(uPhase[1],vMat),c=texture2D(uPhase[2],vMat);
  gfW[0]=a.x;gfW[1]=a.y;gfW[2]=a.z;gfW[3]=a.w;gfW[4]=b.x;gfW[5]=b.y;gfW[6]=b.z;gfW[7]=b.w;gfW[8]=c.x;gfW[9]=c.y;gfW[10]=c.z;gfW[11]=c.w;
  float s=0.;for(int k=0;k<${MAXK};k++){if(k>=uK)gfW[k]=0.;s+=gfW[k];}s=max(s,1e-4);for(int k=0;k<${MAXK};k++)gfW[k]/=s;
}
`;
// look: {refine: midpoint Phong refinement of the mesh for close views, interior: the vault seen from inside (the sun
// outside, the matter lit by the light it transmits), camera: {pos, target, fov}, sun: [x, y, z]}
export function createFieldView({renderer,sim,palette={},material={},width=1920,height=1080,look:lookOpts={}}){
  const N=sim.N,G=sim.G,R=sim.R,refine=!!lookOpts.refine,interior=!!lookOpts.interior;
  // the refined mesh: every edge gets a midpoint (a view-only vertex), every triangle four
  const NE=sim.NE,NV=refine?N+NE:N,E=sim.edges;let tris=sim.tris;
  if(refine){const id=new Map();for(let e=0;e<NE;e++)id.set(E[2*e]*N+E[2*e+1],e);const mid=(a,b)=>N+id.get(a<b?a*N+b:b*N+a);
    const T=sim.tris,out=new Uint32Array(T.length*4);
    for(let t=0,o=0;t<T.length;t+=3){const a=T[t],b=T[t+1],c=T[t+2],ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
      out.set([a,ab,ca, ab,b,bc, ca,bc,c, ab,bc,ca],o);o+=12;}
    tris=out;}
  const scene=new THREE.Scene();
  const C=x=>new THREE.Color(x);
  const body=C(palette.primary||'#e1d7c9'),metal=C(palette.secondary||'#a8a090'),lamp=C(palette.accent||'#f6a331'),deep=C(palette.deep||'#09090a'),haze=C(palette.haze||'#1c1e23');
  // titanium is champagne whatever the palette's secondary (it tints it a little)
  const champagne=C('#d8ccb4').lerp(metal,.12);
  // background: a charcoal gradient that keeps a little of the haze around the matter
  const bg=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({depthWrite:false,depthTest:false,
    uniforms:{uDeep:{value:deep.clone().multiplyScalar(.9)},uHaze:{value:haze.clone().multiplyScalar(1.15)},uAspect:{value:width/height}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,1.,1.);}',
    fragmentShader:`varying vec2 vUv;uniform vec3 uDeep;uniform vec3 uHaze;uniform float uAspect;
      void main(){vec2 p=(vUv-vec2(.52,.56))*vec2(uAspect,1.);float r=length(p);vec3 c=mix(uHaze,uDeep,smoothstep(.05,1.05,r));
        float n=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);gl_FragColor=vec4(c+(n-.5)/255.,1.);}`}));
  bg.frustumCulled=false;bg.renderOrder=-10;scene.add(bg);
  // ---- The sheet ------------------------------------------------------------------------------------------------
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(NV*3),nor=new Float32Array(NV*3),uv=new Float32Array(NV*2),grow=new Float32Array(NV),crest=new Float32Array(NV),nor0=new Float32Array(N*3);
  for(let i=0;i<N;i++){uv[2*i]=(sim.xi[2*i]+1)/2;uv[2*i+1]=(sim.xi[2*i+1]+1)/2;}
  for(let e=0;e<NE&&refine;e++){const a=E[2*e],b=E[2*e+1];uv[2*(N+e)]=(uv[2*a]+uv[2*b])/2;uv[2*(N+e)+1]=(uv[2*a+1]+uv[2*b+1])/2;}
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal',new THREE.BufferAttribute(nor,3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geo.setAttribute('aGrow',new THREE.BufferAttribute(grow,1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aCrest',new THREE.BufferAttribute(crest,1).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(tris),1));
  geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(),R*2.4);
  // the phases, four to a texture
  const phaseData=[...Array(TEX)].map(()=>new Float32Array(G*G*4));
  const phaseTex=phaseData.map(d=>{const t=new THREE.DataTexture(d,G,G,THREE.RGBAFormat,THREE.FloatType);t.magFilter=t.minFilter=THREE.LinearFilter;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.needsUpdate=true;return t;});
  // each subsystem's phase is its own body in the brief's palette (ivory, charcoal, champagne, bone, smoke, a warm clay),
  // alternating light and dark so territories read as interlocking strata; the order follows the subsystems' birth
  const white=body.clone().lerp(new THREE.Color('#f4f1ea'),.55);
  const TONES=[white,new THREE.Color('#2b2a29'),new THREE.Color('#a7aca6'),new THREE.Color('#ddd3c2'),new THREE.Color('#585b5f'),new THREE.Color('#efe9dd'),
    new THREE.Color('#8e8880'),new THREE.Color('#c9cdc6'),new THREE.Color('#3f3c39'),new THREE.Color('#b8ad9c'),new THREE.Color('#e6e3dc'),new THREE.Color('#716b64')];
  const tints=TONES.map(c=>c.clone());
  // which tone each territory wears: in order of birth, the tone farthest in lightness from its neighbours' (territories
  // whose seats are close, or that a dependency couples), so every boundary that matters is visible
  const lum=c=>.2126*c.r+.7152*c.g+.0722*c.b,used=[];
  function assignTones(K,seats,Cm){
    // a territory keeps its tone for life; only a newborn chooses (by its seat's neighbours)
    if(used.length>=K)return;
    for(let k=used.length;k<K;k++){
      const nb=[];for(let j=0;j<k;j++){const d=Math.hypot(seats[2*k]-seats[2*j],seats[2*k+1]-seats[2*j+1]);if(d<.9)nb.push(used[j]);}
      let best=0,bs=-1;for(let t=0;t<TONES.length;t++){if(used.includes(t)&&used.length<TONES.length)continue;let m=1;for(const u of nb)m=Math.min(m,Math.abs(lum(TONES[t])-lum(TONES[u])));const sc=m-.002*t;if(sc>bs){bs=sc;best=t;}}
      used.push(best);tints[k].copy(TONES[best]);}
  }
  const kind=material.kind||'porcelain';
  const look={porcelain:{rough:.42,coat:.9,coatRough:.035},celadon:{rough:.38,coat:.95,coatRough:.03},smoke:{rough:.34,coat:1,coatRough:.03},onyx:{rough:.32,coat:1,coatRough:.025}}[kind]||{rough:.4,coat:.9,coatRough:.035};
  const mapData=new Float32Array(G*G*4),mapTex=new THREE.DataTexture(mapData,G,G,THREE.RGBAFormat,THREE.FloatType);mapTex.magFilter=mapTex.minFilter=THREE.LinearFilter;mapTex.needsUpdate=true;
  const uniforms={uMap:{value:mapTex},uSeat:{value:[...Array(MAXK)].map(()=>new THREE.Vector2())},uBands:{value:4.5},uDebug:{value:0},uFlowGlow:{value:lookOpts.flowGlow??1.6},uPhase:{value:phaseTex},uTint:{value:tints},uMix:{value:new Float32Array(MAXK*MAXK)},uK:{value:0},uMetal:{value:champagne},uLamp:{value:lamp.clone()},
    uBackDir:{value:new THREE.Vector3(0,-1,0)},uBack:{value:.55*clamp(material.translucency??1,0,1.4)},uSeamGlow:{value:lamp.clone().multiplyScalar(.12)},
    uSunDir:{value:new THREE.Vector3(0,1,0)},uSunColor:{value:new THREE.Color(0xfff1dc)},uTrans:{value:(lookOpts.transmit??3.2)*clamp(material.translucency??1,.4,1.4)}};
  const mat=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:look.rough,metalness:0,clearcoat:look.coat*clamp(material.glaze??.8,.3,1),clearcoatRoughness:look.coatRough,
    side:THREE.DoubleSide,envMapIntensity:interior?.35:.9});
  if(interior)mat.defines={GF_INTERIOR:''};
  mat.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,uniforms);
    sh.vertexShader=VS_HEAD+sh.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvMat=uv;vGrow=aGrow;vCrest=aCrest;')
      .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader=FS_HEAD+sh.fragmentShader
      .replace('#include <color_fragment>',`#include <color_fragment>
        gfPhases();
        vec3 tint=vec3(0.);float seam=0.,vein=0.;
        // agate banding: rings around each subsystem's seat, drawn through the flow map, so the currents stretch and fold them
        // veins in the matter, drawn through the flow map: where a current runs they stretch and fold with it
        vec2 M=texture2D(uMap,vMat).xy*uBands;vec2 q=M+.6*vec2(gfNoise(M*.5+3.1),gfNoise(M*.5-1.7));
        float vn=gfNoise(q)+.5*gfNoise(q*2.1+7.3);float vw=fwidth(vn)+.012;float band=1.-smoothstep(.0,vw*1.6+.03,abs(vn));
        // where the flow map is stretched beyond what its grid resolves, the veins fade instead of aliasing
        float stretch=(length(dFdx(M))+length(dFdy(M)))/((length(dFdx(vMat))+length(dFdy(vMat)))*uBands+1e-6);band*=1.-smoothstep(5.,12.,stretch);
        for(int k=0;k<${MAXK};k++){tint+=gfW[k]*uTint[k];}
        float gfBand=band;
        for(int k=0;k<${MAXK};k++)for(int j=0;j<${MAXK};j++){if(j<=k)continue;float w=gfW[k]*gfW[j];float m=uMix[k*${MAXK}+j];seam+=w*(1.-m);vein+=w*m;}
        // a boundary between phases that do not mix: a titanium seam (sharpened from the field's own gradient)
        float sw=fwidth(seam)*1.5+.02;float seamMask=smoothstep(.16-sw,.2+sw,seam);
        // intermingled phases: fine veins following the boundary's own iso-lines
        float veinMask=smoothstep(.04,.2,vein)*(.5+.5*sin(vein*90.));
        diffuseColor.rgb=mix(tint,mix(tint*.55,vec3(.8,.77,.72),.3),band*.75);
        diffuseColor.rgb=mix(diffuseColor.rgb,uMetal,seamMask);
        diffuseColor.rgb=mix(diffuseColor.rgb,uLamp*.9+.1,veinMask*.35);
        float gfSeam=seamMask;
        // the rolled lip of the sheet's cut edge: fired matter has a rim, cloth does not
        float rimR=length(vMat*2.-1.);float lip=smoothstep(.955,.99,rimR);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.93,.91,.87),lip*.85);float gfLip=lip;`)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(mix(roughnessFactor,.24,gfSeam),.2,gfLip);')
      .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.92,gfSeam);')
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        // translucency: grown matter is spread thinner, so the lamp behind it shines through (porcelain as a lithophane)
        {// a supply line's nutrient, carried by its current: amber matter streaming from the territory depended on into the
         // dependent one, brightest in the veins (the flow, never the music)
         vec2 NF=texture2D(uMap,vMat).zw;float nu=clamp(NF.x*uFlowGlow,0.,1.);
         totalEmissiveRadiance+=uLamp*nu*nu*(.12+.88*gfBand)*(1.-gfSeam)*1.3;
         totalEmissiveRadiance+=uSeamGlow*gfSeam*vCrest;}
        #ifdef GF_INTERIOR
        {// inside the vault the sun is outside: the matter is lit by the light it transmits. Light glazes pass it, dark ones
         // and the seams do not, thinner (more grown) matter passes more, and a fold with another fold between it and the
         // sun stays dark (the sun's own shadow map)
         float sunVis=1.;
         #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
           sunVis=getShadow(directionalShadowMap[0],directionalLightShadows[0].shadowMapSize,1.,directionalLightShadows[0].shadowBias,directionalLightShadows[0].shadowRadius,vDirectionalShadowCoord[0]);
         #endif
         float through=max(0.,-dot(normal,uSunDir));float passes=dot(tint,vec3(.3,.5,.2));
         float thin=.45+.55*clamp((vGrow-1.)*.9,0.,1.);
         totalEmissiveRadiance+=uSunColor*uTrans*(.25+.75*through)*sunVis*passes*passes*thin*(1.-.9*gfSeam)*(1.-.4*gfBand);}
        #endif`)
      .replace('#include <dithering_fragment>','#include <dithering_fragment>\nif(uDebug>.5)gl_FragColor=vec4(uDebug>1.5?vec3(gfW[0],gfW[1],gfW[2]):tint,1.);');
  };
  const sheet=new THREE.Mesh(geo,mat);sheet.castShadow=true;sheet.receiveShadow=true;sheet.frustumCulled=false;scene.add(sheet);
  // ---- Light: a raking key with shadows, a cool fill, the amber lamp behind and below ------------------------------
  const key=new THREE.DirectionalLight(interior?0xfff1dc:0xffffff,interior?.6:2.5);key.position.set(...(lookOpts.sun||[-.55,1,.35])).normalize().multiplyScalar(R*3);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);const sc=key.shadow.camera;sc.left=sc.bottom=-R*1.9;sc.right=sc.top=R*1.9;sc.near=R*.5;sc.far=R*7;
  key.shadow.bias=interior?-.0025:-.0004;key.shadow.normalBias=interior?0:.6;key.shadow.radius=interior?5:3;
  scene.add(key,key.target);
  const fill=new THREE.DirectionalLight(0xc8d4e8,interior?.12:.45);fill.position.set(.8,.35,-.6).multiplyScalar(R*3);scene.add(fill);
  const backLight=new THREE.DirectionalLight(0xffe2bc,interior?0:.35);backLight.position.set(.18,-1,-.3).multiplyScalar(R*3);backLight.castShadow=!interior;
  backLight.shadow.mapSize.set(2048,2048);{const c=backLight.shadow.camera;c.left=c.bottom=-R*1.9;c.right=c.top=R*1.9;c.near=R*.5;c.far=R*7;}backLight.shadow.bias=-.002;backLight.shadow.normalBias=0;backLight.shadow.radius=4;
  scene.add(backLight,backLight.target);
  scene.add(new THREE.HemisphereLight(interior?0x6b5f52:0xe4e8ee,0x161514,interior?.22:.4));
  if(interior)scene.fog=new THREE.FogExp2(deep.clone().lerp(new THREE.Color(0x2a2118),.6),lookOpts.fog??.006);
  // an environment for the glaze: a dark studio with two soft boxes
  const pm=new THREE.PMREMGenerator(renderer);
  const env=new THREE.Scene();env.background=new THREE.Color(0x0b0b0c);
  const box=(w,h,c,x,y,z)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:c,side:THREE.DoubleSide}));m.position.set(x,y,z);m.lookAt(0,0,0);env.add(m);};
  box(8,4,0xffffff,-4,6,3);box(3,9,0xc4d2e2,7,1,-3);box(14,3,0x3a3836,0,-6,0);box(4,4,0xfff0dc,2,4,-6);
  const envTex=pm.fromScene(env,.04).texture;scene.environment=envTex;
  // ---- The camera: fixed, oblique from above ----------------------------------------------------------------------
  const camera=new THREE.PerspectiveCamera(lookOpts.camera?.fov??30,width/height,interior?.3:1,R*30);
  function frame({azimuth=-.5,elevation=.92,distance=null,target=[0,-R*.05,R*.04]}={}){
    const d=distance??R*5.5;camera.position.set(target[0]+d*Math.cos(elevation)*Math.sin(azimuth),target[1]+d*Math.sin(elevation),target[2]+d*Math.cos(elevation)*Math.cos(azimuth));
    camera.lookAt(target[0],target[1],target[2]);camera.updateMatrixWorld();
  }
  if(lookOpts.camera){const c=lookOpts.camera;camera.position.set(...c.pos);camera.lookAt(...c.target);camera.updateMatrixWorld();}else frame();
  // ---- Per frame: copy the state (interpolated between the last two steps) and the field ---------------------------
  const prev=new Float64Array(N*3);let prevStep=-1;
  const vgrow=new Float64Array(N),vcount=new Float64Array(N);
  function capture(){prev.set(sim.x);prevStep=sim.step;}
  function sync(alpha=1){
    // the slow shape (interpolated between the last two steps) displaced by the vibration along its normal; the normals
    // are those of the displaced surface, so ripples catch the light
    const x=sim.x,n=sim.n,u=sim.vibration,a=prevStep<0?1:clamp(alpha);
    for(let i=0;i<N;i++)for(let c=0;c<3;c++){const o=3*i+c;pos[o]=prev[o]+(x[o]-prev[o])*a+u[i]*n[o];}
    const normalsOf=(T,out,count)=>{out.fill(0,0,count*3);
      for(let t=0;t<T.length;t+=3){const p=3*T[t],q=3*T[t+1],r=3*T[t+2];
        const e1x=pos[q]-pos[p],e1y=pos[q+1]-pos[p+1],e1z=pos[q+2]-pos[p+2],e2x=pos[r]-pos[p],e2y=pos[r+1]-pos[p+1],e2z=pos[r+2]-pos[p+2];
        const nx=e1y*e2z-e1z*e2y,ny=e1z*e2x-e1x*e2z,nz=e1x*e2y-e1y*e2x;
        out[p]+=nx;out[p+1]+=ny;out[p+2]+=nz;out[q]+=nx;out[q+1]+=ny;out[q+2]+=nz;out[r]+=nx;out[r+1]+=ny;out[r+2]+=nz;}
      for(let i=0;i<count;i++){const o=3*i,l=Math.hypot(out[o],out[o+1],out[o+2])||1;out[o]/=l;out[o+1]/=l;out[o+2]/=l;}};
    if(refine){
      // each midpoint on the curved surface the corners' normals describe (Phong tessellation, alpha 3/4)
      normalsOf(sim.tris,nor0,N);
      for(let e=0;e<NE;e++){const A=E[2*e],B=E[2*e+1],o=3*(N+e);
        const mx=(pos[3*A]+pos[3*B])/2,my=(pos[3*A+1]+pos[3*B+1])/2,mz=(pos[3*A+2]+pos[3*B+2])/2;
        const da=(mx-pos[3*A])*nor0[3*A]+(my-pos[3*A+1])*nor0[3*A+1]+(mz-pos[3*A+2])*nor0[3*A+2],db=(mx-pos[3*B])*nor0[3*B]+(my-pos[3*B+1])*nor0[3*B+1]+(mz-pos[3*B+2])*nor0[3*B+2];
        pos[o]=mx-.375*(da*nor0[3*A]+db*nor0[3*B]);pos[o+1]=my-.375*(da*nor0[3*A+1]+db*nor0[3*B+1]);pos[o+2]=mz-.375*(da*nor0[3*A+2]+db*nor0[3*B+2]);}
    }
    normalsOf(tris,nor,NV);
    vgrow.fill(0);vcount.fill(0);
    for(let e=0;e<sim.NE;e++){const g=sim.L[e]/sim.L0[e],p=E[2*e],q=E[2*e+1];vgrow[p]+=g;vgrow[q]+=g;vcount[p]++;vcount[q]++;}
    for(let i=0;i<N;i++){grow[i]=vgrow[i]/vcount[i];crest[i]=sim.cv[i];}
    for(let e=0;e<NE&&refine;e++){const A=E[2*e],B=E[2*e+1];grow[N+e]=(grow[A]+grow[B])/2;crest[N+e]=(crest[A]+crest[B])/2;}
    geo.attributes.position.needsUpdate=geo.attributes.normal.needsUpdate=geo.attributes.aGrow.needsUpdate=geo.attributes.aCrest.needsUpdate=true;
    const K=sim.K(),phi=sim.phi(),GG=G*G;uniforms.uK.value=K;
    for(let t=0;t<TEX;t++){const d=phaseData[t];d.fill(0);for(let c4=0;c4<4;c4++){const k=t*4+c4;if(k>=K)continue;for(let c=0;c<GG;c++)d[c*4+c4]=phi[k*GG+c];}phaseTex[t].needsUpdate=true;}
    const fl=sim.flow();for(let c=0;c<GG;c++){mapData[4*c]=fl.mapX[c];mapData[4*c+1]=fl.mapY[c];mapData[4*c+2]=fl.nut[c];mapData[4*c+3]=fl.fed[c];}mapTex.needsUpdate=true;
    const st=sim.seats();for(let k=0;k<K;k++)uniforms.uSeat.value[k].set(st[2*k],st[2*k+1]);
    const M=uniforms.uMix.value,Cm=sim.coupling();assignTones(K,st,Cm);M.fill(0);for(let k=0;k<K;k++)for(let j=0;j<K;j++)M[k*MAXK+j]=Math.min(1,Cm[k*K+j]);
  }
  const backDir=new THREE.Vector3();
  // viewport: {x, y, w, h} in pixels (several views share one canvas in the comparisons); the whole canvas otherwise
  function render(viewport=null){
    if(viewport){renderer.setViewport(viewport.x,viewport.y,viewport.w,viewport.h);renderer.setScissor(viewport.x,viewport.y,viewport.w,viewport.h);renderer.setScissorTest(true);
      if(Math.abs(camera.aspect-viewport.w/viewport.h)>1e-6)resize(viewport.w,viewport.h);}
    // the lamp's direction in view space (the material's lighting is in view space)
    backDir.copy(backLight.position).normalize().transformDirection(camera.matrixWorldInverse);uniforms.uBackDir.value.copy(backDir);
    uniforms.uSunDir.value.copy(key.position).normalize().transformDirection(camera.matrixWorldInverse);
    renderer.render(scene,camera);
  }
  function resize(w,h){camera.aspect=w/h;camera.updateProjectionMatrix();bg.material.uniforms.uAspect.value=w/h;}
  function dispose(){geo.dispose();mat.dispose();phaseTex.forEach(t=>t.dispose());envTex.dispose();pm.dispose();bg.geometry.dispose();bg.material.dispose();}
  return {scene,camera,frame,capture,sync,render,resize,dispose,debug:v=>{uniforms.uDebug.value=v;},stats:()=>({triangles:tris.length/3,vertices:NV})};
}

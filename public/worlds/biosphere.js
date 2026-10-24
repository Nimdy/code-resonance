// Fractal Biosphere: the software as a bioluminescent ecosystem that grows.
//
// Data -> image (no decoration claims engineering work):
//  - subsystem (district) -> an organism rooted at its persisted site; its species comes from the recipe
//                            (coral, fern, kelp, mycelial, crystal-tree), its trunk grows with its folders
//  - folder               -> a limb from the trunk, in the order the folder first appeared
//  - file (module)        -> a branch from its folder's limb; long files fork into twigs (fractal detail)
//  - symbol               -> a leaf along its branch in stable slot order; components blossom, classes bear pods,
//                            API routes raise glowing stamens, interfaces and types are translucent fronds
//  - material state       -> draft: pale new growth; committed: mature; validated: leaves glow; stressed: blight
//  - dependency           -> a tendril; across subsystems an arching vine with nutrient pulses
//  - agent                -> a firefly swarm: drifting near its organism while working on a request, gathered at the
//                            branch it reads or edits while a tool runs, settled low while waiting; it leaves on exit
// Ambient life (never progress): everything sways in one continuous current, nutrients flow, leaves breathe,
// spores drift, the ground's veins pulse. Verified milestones leave lasting blooms and unlock new ambient layers.
import {THREE,NOISE,BACKGROUND_VS,clamp,lerp,smooth,hash,rand,rng,instancedBuffers,pointBuffers} from './core.js';
const STATE_INDEX={draft:0,committed:1,validated:2,stressed:3};
const KIND={function:0,method:1,class:2,'ui.component':3,interface:4,type:5,variable:6,'api.route':7};
const SQRT3=Math.sqrt(3);
const secs=(t,epoch)=>Number.isFinite(t)?(t-epoch)/1000:(t>0?1e6:-1e5);
// One current field displaces every vertex by its rest position, so connected parts stay connected while they sway.
const SWAY=`
uniform float uSway,uCurrent;
vec3 sway(vec3 p,float flex,float tv){float h=max(0.,p.y);float k=flex*h*h*.012*uSway;
  vec2 dir=vec2(cos(uCurrent),sin(uCurrent));float ph=dot(p.xz,dir)*.35;
  float a=sin(tv*.55+ph)+.45*sin(tv*1.27+p.x*.6+p.z*.4)+.25*sin(tv*2.3+p.z*1.1);
  float b=cos(tv*.43+p.z*.5)*.6+.3*sin(tv*1.9+p.x*.8);
  return vec3(dir.x*a+dir.y*b*.4,-abs(a)*.08,dir.y*a-dir.x*b*.4)*k;}
`;
const FOG=`uniform vec3 uFog;uniform float uFogD;vec3 fog(vec3 c,float d){return mix(c,uFog,1.-exp(-d*uFogD));}float fogK(float d){return exp(-d*uFogD);}`;
export function createFamily(ctx){
  const {scene,camera,model,recipe}=ctx;const G=recipe.genome,P=G.palette,GEO=G.geometry;
  const col=c=>new THREE.Color(c);
  const pal={primary:col(P.primary),secondary:col(P.secondary),accent:col(P.accent),highlight:col(P.highlight),deep:col(P.deep),haze:col(P.haze),warning:col(P.warning),valid:col(P.valid)};
  const seed=recipe.projectSeed>>>0,species=GEO.species,terrain=G.atmosphere.terrain;
  // Fog dims rather than tints: a bioluminescent world fades to near-black, keeping every colour saturated.
  const fogColor=pal.deep.clone().lerp(pal.haze,terrain==='abyss'?.3:.15).multiplyScalar(terrain==='abyss'?1.1:.8);
  const common={uT:{value:0},uV:{value:0},uSpeed:{value:1},uPx:{value:1},uRes:{value:new THREE.Vector2(1920,1080)},uBeat:{value:0},uActivity:{value:0},
    uSway:{value:G.motion.sway*(species==='kelp'?1.9:species==='crystal-tree'?.35:1)},uCurrent:{value:G.motion.current},uFog:{value:fogColor},uFogD:{value:.006+.011*G.atmosphere.fog},
    uWaves:{value:Array.from({length:4},()=>new THREE.Vector4(0,0,0,-1e5))},uWaveC:{value:Array.from({length:4},()=>new THREE.Vector4(0,0,0,1))},uUnlock:{value:new THREE.Vector4()},uMotion:{value:1}};
  // Waves of light travel through the organisms (growth, validation, recovery, blight): centre, start, colour, speed.
  const WAVE=`uniform vec4 uWaves[4],uWaveC[4];uniform float uT,uSpeed;
    vec3 waves(vec3 p){vec3 a=vec3(0.);for(int i=0;i<4;i++){float age=(uT-uWaves[i].w)/uSpeed;if(age<0.||age>8.)continue;float r=age*uWaveC[i].w;float d=distance(p,uWaves[i].xyz);
      a+=uWaveC[i].rgb*exp(-pow((d-r)*.9,2.))*(1.-age/8.);}return a;}`;
  // ---- Terrain ------------------------------------------------------------------------------------------------
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShaderMaterial({uniforms:{...common,uScale:{value:60},uVein:{value:pal.accent.clone()},uVein2:{value:pal.primary.clone()},
      uDeep:{value:pal.deep},uRoots:{value:Array.from({length:24},()=>new THREE.Vector4(0,0,0,0))},uRipple:{value:Array.from({length:8},()=>new THREE.Vector4(0,0,0,-1e5))},uRippleC:{value:Array.from({length:8},()=>new THREE.Vector4(1,1,1,4))},
      uTide:{value:G.material.bioluminescence},uCaustic:{value:terrain==='abyss'?1:0}},
    vertexShader:`uniform float uScale;varying vec3 vW;void main(){vec3 p=vec3(position.x*uScale,0.,-position.y*uScale);vW=p;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
    fragmentShader:`${NOISE}${FOG}uniform float uV,uT,uSpeed,uTide,uCaustic,uActivity;uniform vec3 uVein,uVein2,uDeep;uniform vec4 uRoots[24],uRipple[8],uRippleC[8],uUnlock;varying vec3 vW;
      void main(){vec2 p=vW.xz;mat2 rot=mat2(.8,-.6,.6,.8);vec2 q=rot*p;float n=fbm3(vec3(q*.1,uV*.008));
        vec2 w=q+vec2(fbm3(vec3(q*.15,1.)),fbm3(vec3(q*.15,7.)))*3.;
        float ridge=pow(1.-abs(gnoise(vec3(w*.2,uV*.012))),26.);float ridge2=pow(1.-abs(gnoise(vec3(rot*w*.45+7.,uV*.02))),30.);
        float flow=.5+.5*sin(dot(w,vec2(.7,.4))*.9-uV*.7+n*6.);
        vec3 c=uDeep*(.9+n*.6);
        c+=uVein*ridge*(.02+.07*flow)*uTide+uVein2*ridge2*.035*uTide;
        float rootGlow=0.;for(int i=0;i<24;i++){if(uRoots[i].w<=0.)continue;float d=distance(p,uRoots[i].xz);rootGlow+=uRoots[i].w*exp(-d*d*.35);}
        c+=uVein*rootGlow*.03*(.6+.4*flow)+uVein*ridge*rootGlow*.5;
        c+=uCaustic*vec3(.2,.45,.5)*pow(max(0.,sin(p.x*1.3+uV*.7+n*4.)*sin(p.y*1.1-uV*.5+n*3.)),6.)*.12;
        float tide=uUnlock.w*exp(-pow(mod(length(p)*.15-uV*.08,1.)-.5,2.)*40.)*.4;c+=uVein*tide*ridge*3.;
        for(int i=0;i<8;i++){float age=(uT-uRipple[i].w)/uSpeed;if(age<0.||age>uRippleC[i].w)continue;float r=age*3.2;float d=distance(p,uRipple[i].xz);
          c+=uRippleC[i].rgb*exp(-pow((d-r)*1.4,2.))*(1.-age/uRippleC[i].w)*(.6+ridge*2.);}
        float dist=length(cameraPosition-vW);gl_FragColor=vec4(fog(c,dist),1.);}`}));
  ground.frustumCulled=false;ground.renderOrder=-2;scene.add(ground);
  // ---- Branch segments (instanced tapered cylinders) ----------------------------------------------------------
  const cyl=new THREE.CylinderGeometry(1,1,1,species==='crystal-tree'?6:8,1,true);cyl.translate(0,.5,0);
  const segs=instancedBuffers(cyl,{sA:4,sB:4,sInfo:4,sColor:3,sState:4},256);
  const barkMat=new THREE.ShaderMaterial({uniforms:{...common,uValid:{value:pal.valid},uStress:{value:pal.warning},uSap:{value:pal.highlight.clone().lerp(pal.valid,.4)},uBark:{value:G.material.bark}},
    vertexShader:`${SWAY}${WAVE}attribute vec4 sA,sB,sInfo,sState;attribute vec3 sColor;uniform float uV;varying vec3 vC,vN,vW,vWave;varying vec4 vS;varying float vGrow,vY,vV;
      void main(){float age=(uT-sInfo.x)/uSpeed;float grow=clamp(age/1.4,0.,1.);float gone=sInfo.y<1e5?clamp((uT-sInfo.y)/uSpeed/1.6,0.,1.):0.;
        vec3 a=sA.xyz,b=mix(sA.xyz,sB.xyz,grow*(1.-gone*.6));vec3 axis=b-a;float len=max(1e-4,length(axis));vec3 up=axis/len;
        vec3 side=normalize(abs(up.y)<.95?cross(up,vec3(0.,1.,0.)):cross(up,vec3(1.,0.,0.)));vec3 fw=cross(side,up);
        float rad=mix(sA.w,sB.w,position.y)*(grow>0.?1.:0.)*(1.-gone);
        vec3 rest=a+up*position.y*len+(side*position.x+fw*position.z)*rad;
        float flex=mix(sInfo.z,sInfo.w,position.y);vec3 w=rest+sway(rest,flex,uV);
        if(sState.x>2.5)w.y-=flex*.05*max(0.,rest.y-1.)*smoothstep(0.,2.,(uT-sState.z)/uSpeed);
        vW=w;vN=normalize(side*position.x+fw*position.z);vC=sColor;vS=sState;vGrow=grow*(1.-gone);vY=position.y;vV=uV;vWave=waves(rest);
        gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`${NOISE}${FOG}uniform vec3 uValid,uStress,uSap;uniform float uBark,uT,uSpeed;varying vec3 vC,vN,vW,vWave;varying vec4 vS;varying float vGrow,vY,vV;
      void main(){if(vGrow<=0.)discard;vec3 n=normalize(vN);vec3 v=normalize(cameraPosition-vW);float rim=pow(1.-abs(dot(n,v)),2.5);
        float grain=gnoise(vW*vec3(6.,1.,6.))*.5+.5;float rimT=pow(1.-abs(dot(n,v)),4.5);vec3 c=vec3(.01,.01,.014)+vC*(.02+.035*grain*uBark)+vC*rimT*.9;rim=rimT;
        float sap=pow(.5+.5*sin(vW.y*1.7-vV*1.2+vW.x*.5+vC.r*9.),90.);c+=uSap*sap*(.04+rim*.25);
        float k=clamp((uT-vS.z)/uSpeed/1.4,0.,1.);float st=k>.5?vS.x:vS.y;
        if(st<.5)c=c*.6+uSap*(.18+rim*.9);else if(st>2.5)c=c*.5+uStress*(.12+rim*1.1)*(.7+.3*sin(vV*5.+vW.y*3.));else if(st>1.5)c+=uValid*rim*.45;
        c+=vWave*1.4+vC*vS.w*rim;gl_FragColor=vec4(fog(c,length(cameraPosition-vW)),1.);}`});
  const barkMesh=new THREE.Mesh(segs.geometry,barkMat);barkMesh.frustumCulled=false;scene.add(barkMesh);
  // ---- Leaves (instanced quads, aligned along the leaf axis in screen space) -----------------------------------
  const leaves=instancedBuffers(new THREE.PlaneGeometry(1,1),{lA:4,lB:4,lInfo:4,lColor:3,lState:4},256);
  const shape={blade:0,round:1,frond:2,petal:3}[GEO.leafShape]??0;
  const leafMat=new THREE.ShaderMaterial({uniforms:{...common,uValid:{value:pal.valid},uStress:{value:pal.warning},uSap:{value:pal.highlight.clone().lerp(pal.valid,.5)},uShape:{value:species==='crystal-tree'?4:shape},
      uLum:{value:G.material.bioluminescence},uTrans:{value:G.material.translucency}},transparent:true,depthWrite:false,blending:THREE.NormalBlending,side:THREE.DoubleSide,
    vertexShader:`${SWAY}${WAVE}attribute vec4 lA,lB,lInfo,lState;attribute vec3 lColor;uniform float uV,uPx;uniform vec2 uRes;varying vec2 vUv;varying vec3 vC,vWave;varying vec4 vS,vI;varying float vA,vD;
      void main(){float age=(uT-lInfo.x)/uSpeed;float unfurl=smoothstep(0.,1.6,age);float gone=lInfo.y<1e5?clamp((uT-lInfo.y)/uSpeed/1.8,0.,1.):0.;
        vec3 a=lA.xyz+sway(lA.xyz,lState.w,uV);vec3 tipRest=lB.xyz;
        float droop=lState.x>2.5?smoothstep(0.,2.5,(uT-lState.z)/uSpeed):0.;tipRest.y-=droop*lA.w*.9;tipRest.y-=gone*2.5;
        vec3 b=tipRest+sway(tipRest,lState.w*1.15,uV)+vec3(sin(uV*1.7+lInfo.z*9.),cos(uV*1.3+lInfo.z*7.),0.)*.05*lA.w;
        vec3 mid=mix(a,b,.5);vec4 ca=projectionMatrix*viewMatrix*vec4(a,1.),cb=projectionMatrix*viewMatrix*vec4(b,1.),cm=projectionMatrix*viewMatrix*vec4(mid,1.);
        vec2 sa=ca.xy/ca.w,sb=cb.xy/cb.w;vec2 d=(sb-sa)*uRes;float L=length(d);vec2 dir=L>1e-3?d/L:vec2(0.,1.);vec2 nrm=vec2(-dir.y,dir.x);
        float s=unfurl*(1.-gone*.3)*(1.+.08*sin(uV*1.1+lInfo.z*13.));vec2 along=(sb-sa)*(position.y)*s;float width=max(L*lB.w,5.*uPx)*s;
        vec4 cp=cm;cp.xy+=(along+nrm*position.x*width/uRes*2.)*cm.w;gl_Position=cp;
        vUv=position.xy+.5;vC=lColor;vS=lState;vI=lInfo;vWave=waves(mid);vA=smoothstep(0.,.3,age)*(1.-gone);vD=length(cameraPosition-mid);}`,
    fragmentShader:`${FOG}uniform vec3 uValid,uStress,uSap;uniform float uShape,uLum,uTrans,uT,uSpeed,uV,uBeat;varying vec2 vUv;varying vec3 vC,vWave;varying vec4 vS,vI;varying float vA,vD;
      float leafMask(vec2 uv,float kind){vec2 p=uv-vec2(.5,.5);float y=uv.y;
        if(kind>2.5&&kind<3.5){float a=atan(p.x,p.y);float r=length(p)*2.;float pet=.55+.45*cos(a*5.);return smoothstep(pet,pet-.15,r);}            // blossom
        if(kind>1.5&&kind<2.5){float r=length(p*vec2(1.,1.))*2.;return smoothstep(1.,.75,r);}                                                        // pod
        if(kind>6.5){float w=.05+.25*smoothstep(.75,1.,y);return smoothstep(w,w*.4,abs(p.x))*step(.02,y);}                                              // stamen
        float sh=kind>5.5?1.:uShape;float w;
        if(sh<.5)w=.5*sin(3.1416*y);else if(sh<1.5)w=.45*sqrt(max(0.,1.-pow(y*2.-1.,2.)));else if(sh<2.5)w=.48*sin(3.1416*y)*(.75+.25*sin(y*40.));else if(sh<3.5)w=.5*pow(sin(3.1416*pow(y,.7)),1.4);else w=.5*(1.-abs(y*2.-1.));
        return smoothstep(w,w*.55,abs(p.x));}
      void main(){float kind=vI.w;float m=leafMask(vUv,kind);if(m<.01)discard;
        float k=clamp((uT-vS.z)/uSpeed/1.4,0.,1.);float st=k>.5?vS.x:vS.y;
        float vein=pow(1.-abs(vUv.x-.5)*2.,8.)*.5;float breathe=.75+.25*sin(uV*1.2+vI.z*20.)+.1*uBeat;
        vec3 c=vC*(.9+vein*1.6)*breathe*uLum;
        if(st<.5)c=mix(c,uSap,.55)*.8;else if(st>2.5)c=mix(uStress*.7,vec3(.35,.12,.05),vUv.y)*(.7+.3*sin(uV*4.+vI.z*30.));else if(st>1.5)c=c*1.35+uValid*.35*breathe;
        if(kind>2.5&&kind<3.5)c*=1.5;if(kind>6.5)c+=vC*smoothstep(.8,1.,vUv.y)*3.;if(kind>3.5&&kind<5.5)c*=.55+uTrans*.3;
        c+=vWave*1.6;float a=m*vA*(kind>3.5&&kind<5.5?.35+uTrans*.3:.72);gl_FragColor=vec4(c*fogK(vD),a);}`});
  const leafMesh=new THREE.Mesh(leaves.geometry,leafMat);leafMesh.frustumCulled=false;leafMesh.renderOrder=2;scene.add(leafMesh);
  // ---- Tendrils and vines (dependencies) --------------------------------------------------------------------------
  const SEG=28;const ribbon=(()=>{const g=new THREE.BufferGeometry(),t=[],side=[],idx=[];
    for(let i=0;i<=SEG;i++){t.push(i/SEG,i/SEG);side.push(-1,1);if(i<SEG){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}}
    g.setAttribute('position',new THREE.Float32BufferAttribute(new Array((SEG+1)*2*3).fill(0),3));g.setAttribute('aT',new THREE.Float32BufferAttribute(t,1));g.setAttribute('aSide',new THREE.Float32BufferAttribute(side,1));g.setIndex(idx);return g;})();
  const vines=instancedBuffers(ribbon,{vA:4,vB:4,vInfo:4,vColA:3,vColB:3},128);
  const vineMat=new THREE.ShaderMaterial({uniforms:{...common,uFlow:{value:G.motion.flow}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:`${SWAY}attribute float aT,aSide;attribute vec4 vA,vB,vInfo;attribute vec3 vColA,vColB;uniform float uV,uPx,uT,uSpeed;uniform vec2 uRes;varying float vT,vSide,vAl,vCross,vSeed,vD;varying vec3 vC;
      vec3 curve(vec3 a,vec3 b,float lift,float t,float seed){vec3 m=(a+b)*.5+vec3(0.,lift,0.);float u=1.-t;vec3 p=u*u*a+2.*u*t*m+t*t*b;
        p+=vec3(sin(t*9.+seed*20.+uV*.4),cos(t*7.+seed*13.),sin(t*11.+seed*7.))*.12*sin(3.1416*t)*(1.+distance(a,b)*.05);return p;}
      void main(){vec3 a=vA.xyz+sway(vA.xyz,vA.w,uV),b=vB.xyz+sway(vB.xyz,vB.w,uV);float d=distance(a,b);
        float lift=vInfo.z>.5?(1.5+.35*d):(-min(a.y,b.y)*.8+.2);
        vec3 p=curve(a,b,lift,aT,vInfo.w),q=curve(a,b,lift,min(1.,aT+.01),vInfo.w);if(aT>.99)q=p+(p-curve(a,b,lift,aT-.01,vInfo.w));
        vec4 cp=projectionMatrix*viewMatrix*vec4(p,1.),cq=projectionMatrix*viewMatrix*vec4(q,1.);vec2 dir=normalize((cq.xy/cq.w-cp.xy/cp.w)*uRes+1e-5);vec2 nrm=vec2(-dir.y,dir.x);
        float age=(uT-vInfo.x)/uSpeed;float grow=clamp(age/(vInfo.z>.5?2.4:1.2),0.,1.);float gone=vInfo.y<1e5?clamp((uT-vInfo.y)/uSpeed,0.,1.):0.;
        float w=(vInfo.z>.5?4.2:2.2)*uPx*(1.+(1.-smoothstep(0.,3.,age))*1.4);cp.xy+=nrm*aSide*w/uRes*2.*cp.w;gl_Position=cp;
        vT=aT;vSide=aSide;vAl=(aT<=grow?1.:0.)*(1.-gone);vCross=vInfo.z;vSeed=vInfo.w;vC=mix(vColA,vColB,aT);vD=length(cameraPosition-p);}`,
    fragmentShader:`${FOG}uniform float uV,uFlow,uActivity;varying float vT,vSide,vAl,vCross,vSeed,vD;varying vec3 vC;
      void main(){if(vAl<.01)discard;float edge=1.-vSide*vSide;float p=fract(vT*(vCross>.5?2.5:4.)-uV*(.15+.1*uFlow)*(1.+uActivity)+vSeed);
        float pulse=smoothstep(0.,.06,p)*smoothstep(.25,.06,p);gl_FragColor=vec4(vC*edge*((vCross>.5?.32:.12)+pulse*(vCross>.5?1.4:.7))*vAl*fogK(vD),1.);}`});
  const vineMesh=new THREE.Mesh(vines.geometry,vineMat);vineMesh.frustumCulled=false;vineMesh.renderOrder=1;scene.add(vineMesh);
  // ---- Spores, fireflies (unlock), agents, bursts ---------------------------------------------------------------
  const sporeCount=Math.round(2600+4200*G.atmosphere.spores),spores=pointBuffers({pInfo:4,pColor:3},sporeCount);
  {const r=rng(hash(`spores/${seed}`));const cols=[pal.highlight,pal.valid,pal.secondary,pal.accent];
    for(let i=0;i<sporeCount;i++){spores.write('position',i,(r()-.5)*2,r(),(r()-.5)*2);spores.write('pInfo',i,r(),.3+r()*1.6,r()*6.283,i<sporeCount*.12?1:0);const c=cols[Math.floor(r()*cols.length)];spores.write('pColor',i,c.r,c.g,c.b);}spores.commit(sporeCount);}
  const sporeMat=new THREE.ShaderMaterial({uniforms:{...common,uBox:{value:new THREE.Vector3(40,14,40)},uRise:{value:terrain==='abyss'?-.18:.22},uSpores:{value:G.atmosphere.spores},uFlies:{value:G.atmosphere.fireflies}},
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`uniform vec3 uBox;uniform float uV,uPx,uRise,uMotion;uniform vec4 uUnlock;attribute vec4 pInfo;attribute vec3 pColor;varying vec3 vC;varying float vA,vD;
      void main(){float fly=pInfo.w;float y=fract(position.y+uV*uRise*.03*pInfo.y*uMotion)*uBox.y;
        vec3 p=vec3(position.x*uBox.x+sin(uV*.2*pInfo.y+pInfo.z)*1.5,y,position.z*uBox.z+cos(uV*.17*pInfo.y+pInfo.z)*1.5);
        if(fly>.5){p+=vec3(sin(uV*1.3+pInfo.z*5.),sin(uV*2.1+pInfo.z*3.)*.5,cos(uV*1.1+pInfo.z*7.))*1.2;p.y=1.+mod(p.y,4.);}
        vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;vD=-mv.z;
        float blink=fly>.5?pow(max(0.,sin(uV*(1.5+pInfo.y)+pInfo.z*11.)),8.)*uUnlock.x:1.;
        gl_PointSize=clamp((fly>.5?3.5:1.6)*uPx*30./max(1.,-mv.z),1.,10.);vC=pColor*(fly>.5?3.:.55);vA=blink*smoothstep(0.,1.5,y)*(1.-smoothstep(uBox.y*.8,uBox.y,y));}`,
    fragmentShader:`${FOG}uniform float uSpores;varying vec3 vC;varying float vA,vD;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC*exp(-r*3.)*vA*uSpores*fogK(vD*.6),1.);}`});
  const sporePoints=new THREE.Points(spores.geometry,sporeMat);sporePoints.frustumCulled=false;sporePoints.renderOrder=3;scene.add(sporePoints);
  const SWARM=26,MAX_AGENTS=10,agentPts=pointBuffers({aCol:4,aSize:1},MAX_AGENTS*(SWARM+24));
  const agentMat=new THREE.ShaderMaterial({uniforms:common,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 aCol;attribute float aSize;uniform float uPx;varying vec4 vC;void main(){vec4 mv=viewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*uPx*40./max(.5,-mv.z),0.,48.);vC=aCol;}`,
    fragmentShader:`varying vec4 vC;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC.rgb*(exp(-r*4.)+exp(-r*20.)*2.)*vC.a,1.);}`});
  const agentPoints=new THREE.Points(agentPts.geometry,agentMat);agentPoints.frustumCulled=false;agentPoints.renderOrder=4;scene.add(agentPoints);
  const BURSTS=24,PER=48,burstPts=pointBuffers({bDir:4},BURSTS*PER);
  {const r=rng(hash(`burst/${seed}`));for(let b=0;b<BURSTS;b++)for(let k=0;k<PER;k++){const u=r()*2-1,a=r()*6.283,s=Math.sqrt(1-u*u);burstPts.write('position',b*PER+k,0,0,0);burstPts.write('bDir',b*PER+k,Math.cos(a)*s,Math.abs(u)*.8+.2,Math.sin(a)*s,b+r()*.9);}burstPts.commit(BURSTS*PER);}
  const burstU={uBA:{value:Array.from({length:BURSTS},()=>new THREE.Vector4(0,0,0,-1e5))},uBB:{value:Array.from({length:BURSTS},()=>new THREE.Vector4())},uBC:{value:Array.from({length:BURSTS},()=>new THREE.Vector4(1,0,1,0))}};
  const burstMat=new THREE.ShaderMaterial({uniforms:{...common,...burstU},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 bDir;uniform vec4 uBA[${BURSTS}],uBB[${BURSTS}],uBC[${BURSTS}];uniform float uT,uSpeed,uPx;varying vec3 vC;varying float vA;
      void main(){int b=int(bDir.w);float sp=fract(bDir.w);vec4 A=uBA[b],B=uBB[b],C=uBC[b];float age=(uT-A.w)/uSpeed/C.x;
        if(age<0.||age>1.){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;vA=0.;return;}
        vec3 dir=bDir.xyz;if(C.y>1.5)dir.y=-abs(dir.y)*1.5;float travel=C.y>.5&&C.y<1.5?(1.-age)*C.z:(1.-pow(1.-age,2.2))*C.z*(.4+sp);vec3 p=A.xyz+dir*travel;if(C.y>1.5)p.y-=age*age*2.;
        vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(B.w*uPx*26./max(.5,-mv.z)*(1.-age*.5),1.,22.);vC=B.rgb;vA=(1.-age);}`,
    fragmentShader:`varying vec3 vC;varying float vA;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC*exp(-r*4.)*vA*2.,1.);}`});
  const burstPoints=new THREE.Points(burstPts.geometry,burstMat);burstPoints.frustumCulled=false;burstPoints.renderOrder=5;scene.add(burstPoints);let burstNext=0;
  // Lasting blooms: a fractal crown of petals on organisms that reached verified milestones (grows with each one).
  const PETALS=2400,crowns=instancedBuffers(new THREE.PlaneGeometry(1,1),{cA:4,cB:4,cInfo:4,cColor:3},PETALS);let crownCount=0;
  const crownMat=new THREE.ShaderMaterial({uniforms:common,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:`${SWAY}attribute vec4 cA,cB,cInfo;attribute vec3 cColor;uniform float uV,uT,uSpeed,uBeat;varying vec2 vUv;varying vec3 vC;varying float vA;
      void main(){float age=(uT-cInfo.x)/uSpeed-cInfo.y;float open=smoothstep(0.,3.5,age);vec3 base=cA.xyz+sway(cA.xyz,cA.w,uV);
        float spin=uV*.06*(mod(cInfo.z,2.)<1.?1.:-1.);float a=cB.x+spin,el=cB.y*open;float len=cB.z*open*(1.+.06*sin(uV*.9+cInfo.z)+.05*uBeat);
        vec3 dir=vec3(cos(a)*cos(el),sin(el),sin(a)*cos(el));vec3 side=normalize(cross(dir,vec3(0.,1.,0.))+1e-4);
        vec3 p=base+dir*(position.y+.5)*len+side*position.x*len*cB.w;vUv=position.xy+.5;vC=cColor;vA=smoothstep(0.,.5,age);
        gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform float uV;varying vec2 vUv;varying vec3 vC;varying float vA;void main(){float w=.5*pow(sin(3.1416*pow(vUv.y,.7)),1.2);float m=smoothstep(w,w*.5,abs(vUv.x-.5));if(m<.01)discard;
      float vein=pow(1.-abs(vUv.x-.5)*2.,6.);gl_FragColor=vec4(vC*(.5+vein*.8+smoothstep(.85,1.,vUv.y))*m*vA*1.3,1.);}`});
  const crownMesh=new THREE.Mesh(crowns.geometry,crownMat);crownMesh.frustumCulled=false;crownMesh.renderOrder=3;scene.add(crownMesh);
  const crownLevel=new Map();
  // ---- Background: water or night air, deeper above, with soft light shafts ------------------------------------
  const sky=new THREE.ShaderMaterial({uniforms:{...common,uInv:{value:new THREE.Matrix4()},uCam:{value:new THREE.Vector3()},uTop:{value:pal.deep.clone().multiplyScalar(.35)},uHorizon:{value:fogColor.clone()},uGlow:{value:pal.accent.clone().lerp(pal.valid,.3)},
      uShafts:{value:G.atmosphere.lightShafts*(terrain==='abyss'?1.4:terrain==='cavern'?.4:.8)},uAbyss:{value:terrain==='abyss'?1:0}},vertexShader:BACKGROUND_VS,depthWrite:false,depthTest:false,
    fragmentShader:`${NOISE}varying vec2 vUv;uniform mat4 uInv;uniform vec3 uCam,uTop,uHorizon,uGlow;uniform float uV,uShafts,uAbyss;uniform vec4 uUnlock;
      void main(){vec4 p=uInv*vec4(vUv*2.-1.,1.,1.);vec3 d=normalize(p.xyz/p.w-uCam);float h=clamp(d.y,-1.,1.);
        vec3 c=mix(uHorizon,uTop,smoothstep(-.05,.6,h));c+=uHorizon*.5*exp(-abs(h)*7.);
        float n=fbm3(vec3(d.x*3.,d.y*2.-uV*.01,d.z*3.));c*=.85+.3*n;
        float shafts=pow(max(0.,sin(atan(d.z,d.x)*13.+n*3.+uV*.05)),12.)*smoothstep(.0,.7,h)*uShafts;c+=uGlow*shafts*.05;
        float veil=uUnlock.z*smoothstep(.1,.6,fbm3(vec3(d.x*5.,d.y*8.-uV*.04,d.z*5.)))*smoothstep(.15,.5,h);c+=uGlow*veil*.25;
        gl_FragColor=vec4(c,1.);}`});
  // ---- Structure ----------------------------------------------------------------------------------------------
  const orgs=new Map();      // district id -> organism {root, height, color, dirs:Map, top, index}
  const branchOf=new Map();  // module id -> {tip, base, points, flex, color, org, leafSlots:[...]}
  let builtVersion=-1,segCount=0,leafCount=0,vineCount=0,extent=8,centre=new THREE.Vector3();
  const tmp=new THREE.Vector3();
  const S=1.25*G.space.spread;  // world units per layout cell
  const hexWorld=(q,r)=>new THREE.Vector3((SQRT3*q+SQRT3/2*r)*S,0,1.5*r*S);
  const SPECIES={coral:{trunk:.55,limb:.6,up:.8,thick:1.5,flex:.4},fern:{trunk:.7,limb:1.25,up:.25,thick:.7,flex:1.1},kelp:{trunk:1.5,limb:.75,up:1,thick:.6,flex:1.8},
    mycelial:{trunk:.3,limb:1.3,up:-.35,thick:.75,flex:.6},'crystal-tree':{trunk:.9,limb:.9,up:.55,thick:1.1,flex:.15}}[species]||{trunk:.7,limb:1,up:.5,thick:1,flex:1};
  // Grows a polyline from p along dir; the recipe's curl and gravitropism bend it, deterministic in its seed.
  function grow(p,dir,len,n,curl,gravity,s){const pts=[p.clone()];let d=dir.clone().normalize();const r=rng(s);
    for(let i=0;i<n;i++){const step=len/n;
      if(species==='crystal-tree'){if(i%2===1)d.applyAxisAngle(new THREE.Vector3(r()-.5,0,r()-.5).normalize(),(r()-.5)*.9);}
      else{d.applyAxisAngle(new THREE.Vector3(-d.z,0,d.x).normalize(),curl*(r()-.35)*.6);d.y+=gravity*.18;d.normalize();}
      pts.push(pts.at(-1).clone().addScaledVector(d,step));}
    return pts;}
  function pointAlong(pts,s){let acc=0;for(let i=1;i<pts.length;i++){const l=pts[i].distanceTo(pts[i-1]);if(acc+l>=s)return {p:pts[i-1].clone().lerp(pts[i],(s-acc)/l),dir:pts[i].clone().sub(pts[i-1]).normalize(),i};acc+=l;}
    return {p:pts.at(-1).clone(),dir:pts.at(-1).clone().sub(pts.at(-2)||pts[0]).normalize(),i:pts.length-1};}
  const length=pts=>{let l=0;for(let i=1;i<pts.length;i++)l+=pts[i].distanceTo(pts[i-1]);return l;};
  function build(t){
    const epoch=model.epoch;orgs.clear();branchOf.clear();
    const districts=[...model.districts.values()].filter(d=>d.members.length).sort((a,b)=>a.order-b.order);
    const segList=[],leafList=[];let index=0;
    for(const d of districts){
      const h=hash(d.id),r=rng(h);
      const members=d.members.map(id=>model.modules.get(id)).filter(Boolean).sort((a,b)=>a.order-b.order);
      const born=Math.min(...members.map(m=>m.born));
      const root=hexWorld(d.q,d.r);
      // Folders in the order they first appeared: each is a limb at a fixed height on the trunk.
      const dirs=[];for(const m of members)if(!dirs.includes(m.dir))dirs.push(m.dir);
      const trunkLen=(2.2+1.15*Math.sqrt(dirs.length))*SPECIES.trunk*G.space.canopy;
      const lean=new THREE.Vector3((r()-.5)*.25,1,(r()-.5)*.25);
      const trunk=grow(root,lean,trunkLen,6,GEO.curl*.5,GEO.gravitropism*.3,h);
      // One saturated palette colour per organism: blending complementary colours would only make grey.
      const color=[pal.primary,pal.accent,pal.secondary][index%3].clone();
      const org={id:d.id,root,trunk,color,index:index++,born,top:trunk.at(-1).clone(),members:members.map(m=>m.id),height:trunkLen,radius:2};
      const leafScale=Math.min(2.4,Math.max(.8,.45+trunkLen*.13));
      orgs.set(d.id,org);
      const thick=(.16+.05*Math.sqrt(members.length))*SPECIES.thick;
      for(let i=1;i<trunk.length;i++)segList.push({a:trunk[i-1],b:trunk[i],ra:thick*(1-(i-1)/trunk.length*GEO.taper),rb:thick*(1-i/trunk.length*GEO.taper),born:secs(born,epoch)+(i-1)*.18,removed:1e6,color,fa:(i-1)/6*SPECIES.flex*.4,fb:i/6*SPECIES.flex*.4,module:null});
      dirs.forEach((dir,j)=>{
        const dm=members.filter(m=>m.dir===dir);const dirBorn=Math.min(...dm.map(m=>m.born));
        const at=pointAlong(trunk,Math.min(trunkLen*.94,trunkLen*.28+1.05*Math.sqrt(j)*SPECIES.trunk));
        const az=j*2.39996+rand(h+j)*.6,elev=Math.PI/2-GEO.branchAngle*(species==='mycelial'?1.6:1);
        const ld=new THREE.Vector3(Math.cos(az)*Math.cos(elev),Math.sin(elev)+SPECIES.up*.4,Math.sin(az)*Math.cos(elev));
        const limbLen=(1.2+.95*Math.sqrt(dm.length))*SPECIES.limb;
        const limb=grow(at.p,ld,limbLen,4,GEO.curl,GEO.gravitropism*SPECIES.up,hash(dir)^h);
        const lt=thick*.6;
        for(let i=1;i<limb.length;i++)segList.push({a:limb[i-1],b:limb[i],ra:lt*(1-(i-1)/limb.length*.7),rb:lt*(1-i/limb.length*.7),born:secs(dirBorn,epoch)+.3+i*.15,removed:1e6,color,fa:SPECIES.flex*(.3+.15*(i-1)),fb:SPECIES.flex*(.3+.15*i),module:null});
        dm.forEach((m,k)=>{
          const mh=hash(m.id),mr=rng(mh);const total=Object.entries(m.counts||{}).filter(([x])=>x!=='property').reduce((a,[,v])=>a+v,0);
          const base=pointAlong(limb,Math.min(limbLen*.97,.35+.8*Math.sqrt(k)*SPECIES.limb));
          const around=k*2.39996+mr()*.5;const perp=new THREE.Vector3(-base.dir.z,0,base.dir.x).normalize().applyAxisAngle(base.dir,around);
          const bd=base.dir.clone().multiplyScalar(Math.cos(GEO.branchAngle)).addScaledVector(perp,Math.sin(GEO.branchAngle)).add(new THREE.Vector3(0,SPECIES.up*.35,0)).normalize();
          const blen=(.75+.2*Math.sqrt(total))*Math.min(1.6,SPECIES.limb*1.1);
          const pts=grow(base.p,bd,blen,3,GEO.curl*1.3,GEO.gravitropism*SPECIES.up,mh);
          const bt=lt*.55*(.7+.15*Math.sqrt(total)),bornS=secs(m.born,epoch),removed=m.removed===null?1e6:secs(m.removed,epoch);
          const flex0=SPECIES.flex*(.5+.2*k/Math.max(1,dm.length));
          const segIdx=[];
          for(let i=1;i<pts.length;i++){segIdx.push(segList.length);segList.push({a:pts[i-1],b:pts[i],ra:bt*(1-(i-1)/pts.length*.75),rb:bt*(1-i/pts.length*.75),born:bornS+.2+i*.14,removed,color:m.test?pal.highlight:color,fa:flex0+.25*(i-1),fb:flex0+.25*i,module:m.id});}
          // Long files fork into twigs, so detail scales with what a file holds.
          const ends=[{pts,flex:flex0+.75}];
          if(total>7){for(let f=0;f<(total>18?3:2);f++){const at2=pointAlong(pts,length(pts)*(.55+.18*f));const td=at2.dir.clone().applyAxisAngle(new THREE.Vector3(0,1,0),(f-1)*1.4+mr()).add(new THREE.Vector3(0,.25,0)).normalize();
            const tw=grow(at2.p,td,blen*.55,2,GEO.curl,GEO.gravitropism,mh+f*97);for(let i=1;i<tw.length;i++){segIdx.push(segList.length);segList.push({a:tw[i-1],b:tw[i],ra:bt*.45,rb:bt*.3,born:bornS+.5+f*.2+i*.12,removed,color,fa:flex0+.5,fb:flex0+.8,module:m.id});}ends.push({pts:tw,flex:flex0+1});}}
          const tip=pts.at(-1).clone();
          branchOf.set(m.id,{tip,base:base.p,pts,ends,flex:flex0+.75,org:d.id,segIdx,color});
          // Leaves along the ends in slot order, alternating sides with the golden angle.
          const syms=[...m.symbols].map(id=>model.symbols.get(id)).filter(Boolean).sort((a,b)=>a.slot-b.slot||a.id.localeCompare(b.id)).slice(0,32);
          syms.forEach((s,i)=>{const end=ends[i%ends.length];const L=length(end.pts);const kind=KIND[s.kind]??0;
            const at3=pointAlong(end.pts,L*(.3+.68*((Math.floor(i/ends.length)+1)/(Math.ceil(syms.length/ends.length)+1))));
            const ang=i*2.39996;const side=new THREE.Vector3(-at3.dir.z,0,at3.dir.x).normalize().applyAxisAngle(at3.dir,ang);
            const size=[.7,.55,.62,1.15,.85,.65,.34,1.5][kind]*GEO.leafDensity*(species==='kelp'?1.4:1)*leafScale;
            let dirv=side.clone().multiplyScalar(.85).addScaledVector(at3.dir,.5).add(new THREE.Vector3(0,.25,0)).normalize();
            if(kind===7)dirv=new THREE.Vector3(0,1,0).addScaledVector(at3.dir,.2).normalize();
            const sBorn=model.bornAt(s);
            const leafBase=[pal.accent,pal.secondary,pal.primary][(org.index+1)%3];
            const lc=kind===3?[pal.primary,pal.secondary,pal.accent][org.index%3].clone():kind===2?pal.secondary.clone():kind===7?pal.valid.clone():kind===4||kind===5?pal.highlight.clone().lerp(leafBase,.5):kind===6?pal.highlight.clone():leafBase.clone().multiplyScalar(kind===1?.8:1);
            leafList.push({a:at3.p,b:at3.p.clone().addScaledVector(dirv,size),width:kind===3?.95:kind===2?.9:kind===7?.12:.32,size,born:Number.isFinite(sBorn)?secs(sBorn,epoch):sBorn===Infinity?1e6:-1e5,
              removed:s.removed===null?(m.removed===null?1e6:secs(m.removed,epoch)):secs(s.removed,epoch),seed:rand(hash(s.id)),kind,flex:end.flex,color:lc,module:m.id});});
          org.radius=Math.max(org.radius,tip.clone().sub(root).setY(0).length()+.8);
        });
      });
      org.canopy=Math.max(org.height,...[...branchOf.values()].filter(b=>b.org===d.id).map(b=>b.tip.y));
    }
    segs.ensure(segList.length);segList.forEach((g,i)=>{segs.write('sA',i,g.a.x,g.a.y,g.a.z,g.ra);segs.write('sB',i,g.b.x,g.b.y,g.b.z,g.rb);segs.write('sInfo',i,g.born,g.removed,g.fa,g.fb);segs.write('sColor',i,g.color.r,g.color.g,g.color.b);segs.write('sState',i,1,1,-1e5,0);});
    segCount=segList.length;segs.commit(segCount);segModules=segList.map(g=>g.module);
    leaves.ensure(leafList.length);leafList.forEach((l,i)=>{leaves.write('lA',i,l.a.x,l.a.y,l.a.z,l.size);leaves.write('lB',i,l.b.x,l.b.y,l.b.z,l.width);leaves.write('lInfo',i,l.born,l.removed,l.seed,l.kind);leaves.write('lColor',i,l.color.r,l.color.g,l.color.b);leaves.write('lState',i,1,1,-1e5,l.flex);});
    leafCount=leafList.length;leaves.commit(leafCount);leafModules=leafList.map(l=>l.module);leafFlex=leafList.map(l=>l.flex);
    // Ground under each organism glows by its size; organisms define the frame.
    const roots=common.uRoots||ground.material.uniforms.uRoots;let k=0;centre.set(0,0,0);let n=0;
    for(const o of orgs.values()){if(k<24)ground.material.uniforms.uRoots.value[k++].set(o.root.x,0,o.root.z,Math.min(1.5,.4+o.members.length*.05));centre.add(o.root);n++;}
    for(;k<24;k++)ground.material.uniforms.uRoots.value[k].set(0,0,0,0);
    if(n)centre.multiplyScalar(1/n);extent=4;for(const o of orgs.values())extent=Math.max(extent,o.root.distanceTo(centre)+o.radius);
    ground.material.uniforms.uScale.value=Math.max(900,extent*40);sporeMat.uniforms.uBox.value.set(extent*2.2,Math.max(10,extent*.7),extent*2.2);
    // Vines: dependencies between branch tips.
    // Many dependencies between the same two organisms read as one braided vine, not a wall of arches: at most four
    // representative strands per pair, brighter the more links they stand for. Internal tendrils quieten as they multiply.
    const pairs=new Map(),internal=[];
    for(const l of model.links.values()){const a=branchOf.get(l.a),b=branchOf.get(l.b);if(!a||!b)continue;
      if(a.org===b.org){internal.push({l,a,b,k:1});continue;}
      const key=[a.org,b.org].sort().join('|');if(!pairs.has(key))pairs.set(key,[]);pairs.get(key).push({l,a,b});}
    const vl=[];const quiet=Math.min(1,Math.sqrt(60/Math.max(60,internal.length)));for(const x of internal)vl.push({...x,k:.8*quiet});
    for(const list of pairs.values()){list.sort((x,y)=>(model.bornAt(x.l)-model.bornAt(y.l))||rand(hash(x.l.key))-rand(hash(y.l.key)));
      const k=Math.min(2.4,1+.35*Math.log2(list.length));for(const x of list.slice(0,4))vl.push({...x,k:1.3*k/Math.min(4,list.length)**.35});}
    vines.ensure(vl.length);vl.forEach(({l,a,b,k},i)=>{const born=model.bornAt(l);vines.write('vA',i,a.tip.x,a.tip.y,a.tip.z,a.flex);vines.write('vB',i,b.tip.x,b.tip.y,b.tip.z,b.flex);
      vines.write('vInfo',i,Number.isFinite(born)?secs(born,epoch):born===Infinity?1e6:-1e5,l.removed===null?1e6:secs(l.removed,epoch),a.org!==b.org?1:0,rand(hash(l.key)));
      const ca=orgs.get(a.org)?.color||pal.primary,cb=orgs.get(b.org)?.color||pal.primary;vines.write('vColA',i,ca.r*k,ca.g*k,ca.b*k);vines.write('vColB',i,cb.r*k,cb.g*k,cb.b*k);});
    vineCount=vl.length;vines.commit(vineCount);
    builtVersion=model.version;
  }
  let segModules=[],leafModules=[],leafFlex=[];
  // ---- Agents: firefly swarms ------------------------------------------------------------------------------
  const AGENT_COLORS=['#ff9ee8','#ffd27a','#9dffcf','#a7b8ff','#ffb08a','#8ef0ff','#e2a6ff','#c9ff8a'].map(c=>new THREE.Color(c));
  const agentState=new Map();
  function swayed(p,flex,tv){const h=Math.max(0,p.y),k=flex*h*h*.012*common.uSway.value,dx=Math.cos(common.uCurrent.value),dz=Math.sin(common.uCurrent.value),ph=(p.x*dx+p.z*dz)*.35;
    const a=Math.sin(tv*.55+ph)+.45*Math.sin(tv*1.27+p.x*.6+p.z*.4)+.25*Math.sin(tv*2.3+p.z*1.1),b=Math.cos(tv*.43+p.z*.5)*.6+.3*Math.sin(tv*1.9+p.x*.8);
    return new THREE.Vector3(p.x+(dx*a+dz*b*.4)*k,p.y-Math.abs(a)*.08*k,p.z+(dz*a-dx*b*.4)*k);}
  function agentGoal(a,i){
    const b=a.fileId?branchOf.get(a.fileId):null,home=a.home?branchOf.get(a.home):null;const o=home?orgs.get(home.org):null;
    if(b&&a.display==='tool')return swayed(b.tip,b.flex,i.tview).add(new THREE.Vector3(0,.5,0));
    const ph=rand(hash(a.id))*6.283;
    if(o){const R=a.display==='waiting'||a.display==='dormant'?o.radius+1.2:o.radius*.6+.6,y=a.display==='waiting'||a.display==='dormant'?.8:o.canopy*.75;
      const sp=a.busy?.25:.06;return new THREE.Vector3(o.root.x+Math.cos(ph+i.tview*sp)*R,y+Math.sin(i.tview*.6+ph)*.4,o.root.z+Math.sin(ph+i.tview*sp)*R);}
    return new THREE.Vector3(centre.x+Math.cos(ph+i.tview*.07)*extent*.5,3,centre.z+Math.sin(ph+i.tview*.07)*extent*.5);
  }
  function updateAgents(i){
    let n=0;const seen=new Set();
    for(const a of i.agents.slice(0,MAX_AGENTS)){
      seen.add(a.id);let st=agentState.get(a.id);if(!st){st={pos:new THREE.Vector3(),snap:true};agentState.set(a.id,st);}
      const goal=agentGoal(a,i);if(st.snap){st.pos.copy(goal);st.snap=false;}else st.pos.lerp(goal,Math.min(1,i.dt*(a.display==='tool'?2:1)));
      const c=AGENT_COLORS[a.voice%8],alpha=a.alpha*(a.busy?1:.5)*G.agentProminence,ph=rand(hash(a.id))*100;
      const spread=a.display==='tool'?.45:a.busy?.9:.6;
      for(let k=0;k<SWARM&&n<agentPts.capacity;k++){const u=k/SWARM*6.283+ph;const r=spread*(.4+.6*rand(k*31+7));
        const p=st.pos.clone().add(new THREE.Vector3(Math.cos(u+i.tview*(1.3+k*.05))*r,Math.sin(i.tview*(2.1+k*.07)+k)*r*.6,Math.sin(u*1.3+i.tview*(1.1+k*.04))*r));
        const blink=.55+.45*Math.sin(i.tview*(3+k*.3)+k*2.1);agentPts.write('position',n,p.x,p.y,p.z);agentPts.write('aCol',n,c.r*1.6,c.g*1.6,c.b*1.6,alpha*blink);agentPts.write('aSize',n,k===0?2.2:.7);n++;}
      const b=a.fileId?branchOf.get(a.fileId):null;
      if(b&&a.display==='tool'){const tip=swayed(b.tip,b.flex,i.tview),inward=a.activity==='reading'||a.activity==='searching';
        for(let k=0;k<20&&n<agentPts.capacity;k++){let f=(i.tview*.8+k/20)%1;if(inward)f=1-f;const p=st.pos.clone().lerp(tip,f);p.y+=Math.sin(f*Math.PI)*.3;
          agentPts.write('position',n,p.x,p.y,p.z);agentPts.write('aCol',n,c.r*1.4,c.g*1.4,c.b*1.4,alpha*Math.sin(f*Math.PI)*.8);agentPts.write('aSize',n,.6);n++;}}
    }
    for(const id of agentState.keys())if(!seen.has(id))agentState.delete(id);
    agentPts.commit(n);
  }
  // ---- Effects --------------------------------------------------------------------------------------------------
  let info={tsec:0,tview:0};let waveNext=0,rippleNext=0;
  const flashes=[];
  function wave(pos,color,speed=3.2){const k=waveNext++%4;common.uWaves.value[k].set(pos.x,pos.y,pos.z,info.tsec);common.uWaveC.value[k].set(color.r,color.g,color.b,speed);}
  function ripple(pos,color,duration=4){const k=rippleNext++%8;ground.material.uniforms.uRipple.value[k].set(pos.x,0,pos.z,info.tsec);ground.material.uniforms.uRippleC.value[k].set(color.r,color.g,color.b,duration);}
  function burst(pos,color,{radius=1.6,duration=1.6,size=1,mode=0}={}){const k=burstNext++%BURSTS;burstU.uBA.value[k].set(pos.x,pos.y,pos.z,info.tsec);burstU.uBB.value[k].set(color.r*1.5,color.g*1.5,color.b*1.5,size);burstU.uBC.value[k].set(duration,mode,radius,0);}
  function flash(a){flashes.push({at:info.tsec,amount:a});if(flashes.length>6)flashes.shift();}
  const tipOf=id=>{const b=branchOf.get(id);return b?swayed(b.tip,b.flex,info.tview):null;};
  const orgsOf=ids=>[...new Set((ids||[]).map(id=>branchOf.get(id)?.org).filter(Boolean))].map(id=>orgs.get(id)).filter(Boolean);
  function crown(o,level,colorA,colorB){
    // Recursive phyllotaxis: each verified milestone adds a ring of petals around the organism's crown.
    const r=rng(hash(o.id)+level*977);const base=o.top.clone().add(new THREE.Vector3(0,.3,0));const count=Math.round(13+level*8);
    for(let k=0;k<count&&crownCount<PETALS;k++){const i=crownCount++;const ang=k*2.39996+level*.5,el=.25+.45*(k/count)+level*.08;
      const c=colorA.clone().lerp(colorB,k/count);crowns.write('cA',i,base.x,base.y,base.z,SPECIES.flex*.9+.6);crowns.write('cB',i,ang,el,(.7+.45*level)*(.8+.4*r()),.42);
      crowns.write('cInfo',i,info.tsec,k*.04,level+k,0);crowns.write('cColor',i,c.r*1.6,c.g*1.6,c.b*1.6);}
    crowns.commit(crownCount);}
  function effect(cmd,i){
    if(i)info=i;const s=cmd.subject||{},k=clamp(cmd.scale,0,1.6);
    switch(cmd.effect){
      case 'sprout':{const o=orgs.get(s.groupId);if(!o)break;ripple(o.root,pal.valid,5);burst(o.root.clone().setY(.4),pal.valid,{radius:2.2,duration:2.2,size:1.2});wave(o.root,pal.valid,3);break;}
      case 'branch-growth':{const b=branchOf.get(s.fileId);if(!b)break;const o=orgs.get(b.org);if(o)wave(o.root,pal.highlight.clone().lerp(pal.valid,.4),4);burst(tipOf(s.fileId),pal.highlight,{radius:1,duration:1.4,size:.8});break;}
      case 'unfurl':{const p=tipOf(s.fileId);if(p)burst(p,pal.secondary,{radius:.9*k+.4,duration:1.4,size:.7});break;}
      case 'shed':{const p=tipOf(s.fileId);if(p)burst(p,pal.warning.clone().lerp(pal.highlight,.5),{radius:1.2,duration:3,size:.8,mode:2});break;}
      case 'mycelium-bridge':{const a=tipOf(s.fileId),b=tipOf(s.targetId);if(!a||!b)break;burst(a,pal.valid,{radius:1.4,duration:2,size:1});burst(b,pal.valid,{radius:1.4,duration:2,size:1});
        if(cmd.tier>=2){ripple(a,pal.valid,4.5);ripple(b,pal.valid,4.5);wave(a.clone().lerp(b,.5),pal.valid.clone().lerp(pal.accent,.4),3.5);}break;}
      case 'blight':{for(const o of orgsOf(s.fileIds)){wave(o.root,pal.warning,2.4);ripple(o.root,pal.warning,4);}for(const id of (s.fileIds||[]).slice(0,10)){const p=tipOf(id);if(p)burst(p,pal.warning,{radius:1,duration:2.6,size:.8,mode:2});}flash(.08*k);break;}
      case 'glow-wave':{for(const o of orgsOf(s.fileIds))wave(o.root,pal.valid,3.6);break;}
      case 'regreen':{for(const o of orgsOf(s.fileIds)){wave(o.root,pal.valid.clone().lerp(pal.highlight,.3),3);ripple(o.root,pal.valid,6);burst(o.top,pal.valid,{radius:2.6,duration:2.6,size:1.2});}flash(.2*k);break;}
      case 'metamorphosis':{for(const id of (s.fileIds||[]).slice(0,12)){const p=tipOf(id);if(p)burst(p,pal.highlight,{radius:1.8,duration:2.4,size:1,mode:1});}for(const o of orgsOf(s.fileIds))wave(o.root,pal.highlight,2.6);flash(.12);break;}
      case 'fractal-bloom':{const list=orgsOf(s.fileIds);const targets=list.length?list:[...orgs.values()].slice(0,1);
        for(const o of targets){const lvl=(crownLevel.get(o.id)||0)+1;crownLevel.set(o.id,lvl);crown(o,lvl,pal.secondary,pal.valid);burst(o.top,pal.highlight,{radius:3.5,duration:3.2,size:1.6});ripple(o.root,pal.highlight,7);wave(o.root,pal.highlight,4);}
        flash((cmd.tier>=4?.9:.45)*k);break;}
      case 'spore-release':{for(const id of (s.fileIds||[]).slice(0,16)){const p=tipOf(id);if(p)burst(p,pal.highlight.clone().lerp(pal.valid,.3),{radius:2.4,duration:3.6,size:.9});}ripple(centre,pal.highlight,6);break;}
      case 'season-turn':{ripple(centre,pal.accent,8);wave(centre,pal.accent,5);break;}
      default:break;
    }
  }
  // ---- Frame -------------------------------------------------------------------------------------------------
  function rebuild(){builtVersion=-1;for(const s of agentState.values())s.snap=true;}
  function update(i){
    info=i;const epoch=model.epoch;
    common.uT.value=i.tsec;common.uV.value=i.tview;common.uSpeed.value=ctx.speed();common.uBeat.value=i.beat*G.music.beatPulse;common.uActivity.value=i.activity;common.uMotion.value=i.overrides.motion??1;
    common.uPx.value=Math.max(.5,ctx.pipeline.size[1]/1080);common.uRes.value.set(ctx.pipeline.size[0],ctx.pipeline.size[1]);
    if(model.version!==builtVersion)build(i.t);
    // Per-frame state: material states (blended in shaders), agent highlight, recent human editing glow.
    const stateOf=new Map();const working=new Set(i.agents.filter(a=>a.fileId&&a.display==='tool').map(a=>a.fileId));
    for(const id of new Set([...segModules,...leafModules])){if(!id)continue;const m=model.modules.get(id);if(!m)continue;
      let cur=m.initial,prev=m.initial,at=-1e5;for(const e of m.states){if(e.at>i.t)break;prev=cur;cur=e.state;at=secs(e.at,epoch);}
      const glow=working.has(id)?.8:Number.isFinite(m.lastHuman)&&i.t-m.lastHuman<4000?.4*(1-(i.t-m.lastHuman)/4000):0;
      stateOf.set(id,[STATE_INDEX[cur]??1,STATE_INDEX[prev]??1,at,glow]);}
    for(let k=0;k<segCount;k++){const v=segModules[k]?stateOf.get(segModules[k]):null;segs.write('sState',k,...(v||[1,1,-1e5,0]));}segs.flush();
    for(let k=0;k<leafCount;k++){const v=stateOf.get(leafModules[k]);leaves.write('lState',k,v?v[0]:1,v?v[1]:1,v?v[2]:-1e5,leafFlex[k]);}leaves.flush();
    updateAgents(i);
    common.uUnlock.value.set(i.unlocks[0]?.level||0,i.unlocks[1]?.level||0,i.unlocks[2]?.level||0,i.unlocks[3]?.level||0);
    sporeMat.uniforms.uFlies.value=G.atmosphere.fireflies;
  }
  function afterCamera(){sky.uniforms.uInv.value.copy(camera.projectionMatrixInverse).premultiply(camera.matrixWorld);sky.uniforms.uCam.value.copy(camera.position);}
  function background(){return sky;}
  function grade(i){const L=G.light,inten=i.overrides.intensity??1;let f=0;for(const x of flashes){const age=(i.tsec-x.at)/ctx.speed();if(age>=0&&age<3)f+=x.amount*Math.exp(-age*2);}
    return {bloom:L.bloom*1.1*(1+.2*i.activity),threshold:L.bloomThreshold*.85,exposure:L.exposure*1.05,contrast:L.contrast,saturation:1.12,vignette:L.vignette+.05,grain:L.grain,flash:f*inten,waves:[],
      tint:i.mood.section==='tension'?new THREE.Vector3(1.05,.95,.92):i.mood.section==='resolve'?new THREE.Vector3(.95,1.05,1):new THREE.Vector3(1,1,1)};}
  // ---- Camera: low among the organisms (wandering) or rising over them (crane) --------------------------------------
  function cameraGoal(i){
    const C=G.camera,fov=C.fov,aspect=camera.aspect||16/9,tanHalf=Math.tan(THREE.MathUtils.degToRad(fov)/2);
    let canopy=3;for(const o of orgs.values())canopy=Math.max(canopy,o.canopy||o.height);
    const fit=Math.max(extent/Math.min(aspect,1.8),canopy*.9)/tanHalf*1.0*C.distance;
    const baseAz=rand(seed)*6.283;let az=baseAz+(C.personality==='wandering'?Math.sin(i.tview/80)*.9+i.tview*.004:i.tview*Math.PI*2/600)*(i.overrides.motion??1);
    let el=C.elevation+(C.personality==='crane'?.12*Math.sin(i.tview/60):.04*Math.sin(i.tview/50));
    let target=centre.clone().setY(canopy*.42),distance=Math.max(8,fit);
    const att=ctx.director.attentionAt(i.t,2),since=att?(i.t-att.at)/ctx.speed()/1000:Infinity;
    if(since<14&&att){const a=subjectOf(att,i);if(a){const k=smooth(1-Math.max(0,since-9)/5);target.lerp(a.pos,.7*k);distance=lerp(distance,Math.min(distance,Math.max(6,a.radius/tanHalf*1.3)),k);}}
    else{const busy=i.agents.find(a=>a.display==='tool'&&a.fileId&&branchOf.has(a.fileId));
      if(busy){const b=branchOf.get(busy.fileId);const o=orgs.get(b.org);target.lerp(b.tip,.35);distance=lerp(distance,Math.max(6,(o?.radius||3)*1.6/tanHalf),.35);}
      else if(i.phase==='idle'&&orgs.size>1){const list=[...orgs.values()].sort((a,b)=>a.index-b.index);const o=list[((Math.floor(i.tview/28)%list.length)+list.length)%list.length];target.lerp(o.root.clone().setY(o.canopy*.5),.5);distance=lerp(distance,Math.max(7,o.radius*1.9/tanHalf),.45);}}
    return {target,distance,azimuth:az,elevation:el,fov,omega:.7};
  }
  function subjectOf(c,i){const s=c.subject||{};
    if(s.fileId&&branchOf.has(s.fileId)){const b=branchOf.get(s.fileId);if(s.targetId&&branchOf.has(s.targetId)){const q=branchOf.get(s.targetId).tip;return {pos:b.tip.clone().lerp(q,.5),radius:b.tip.distanceTo(q)*.6+2};}
      const o=orgs.get(b.org);return {pos:o?o.root.clone().setY(o.canopy*.5).lerp(b.tip,.4):b.tip.clone(),radius:(o?.radius||3)*1.05+.5};}
    if(s.groupId&&orgs.get(s.groupId)){const o=orgs.get(s.groupId);return {pos:o.root.clone().setY(o.canopy*.45),radius:o.radius+1};}
    const list=orgsOf(s.fileIds);if(list.length){const c0=new THREE.Vector3();for(const o of list)c0.add(o.root);c0.multiplyScalar(1/list.length);let r=3;for(const o of list)r=Math.max(r,o.root.distanceTo(c0)+o.radius);c0.y=Math.max(...list.map(o=>o.canopy))*.45;return {pos:c0,radius:r};}
    return null;}
  // ---- Words ---------------------------------------------------------------------------------------------------
  const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
  const orgName=id=>{const d=model.districts.get(id);return d?`${ctx.name(id)} · ${d.role}`:ctx.name(id);};
  const MILESTONE={'first-validation':'First validation','integration-validated':'Integration validated','recovery':'Recovery','refactor':'Refactor validated'};
  function describe(c,i){const s=c.subject||{},d=c.detail||{},n=(s.fileIds||[]).length;const pos=subjectOf(c,i)?.pos;
    switch(c.intent){
      case 'subsystem.created':return {text:'A new organism takes root',sub:orgName(s.groupId),position:pos};
      case 'structure.created':return {text:'New growth unfurls',sub:Object.entries(d.kinds||{}).filter(([k])=>k!=='variable').map(([k,v])=>`${v} ${k.replace('ui.component','blossom').replace('api.route','stamen').replace('class','pod')}`).join(' · ')||plural(d.count||1,'leaf'),position:pos};
      case 'subsystem.connected':{const ga=branchOf.get(s.fileId)?.org,gb=branchOf.get(s.targetId)?.org;return {text:d.first?'Integration · two organisms intertwine':'A vine between organisms strengthens',sub:ga&&gb?`${ctx.name(ga)} ↔ ${ctx.name(gb)}`:'',position:pos};}
      case 'validation.failed':return {text:`Tests fail · blight on ${plural(n,'branch')}`.replace('branchs','branches'),sub:'observed failing run',position:pos,color:'#ff8a6a'};
      case 'validation.passed':return {text:`Tests pass · ${plural(n,'branch').replace('branchs','branches')} glow`,sub:'observed passing run',position:pos,color:'#9dffcf'};
      case 'validation.recovered':return {text:`Recovered · ${plural(d.repaired||n,'branch').replace('branchs','branches')} green again`,sub:'the tests pass again',position:pos,color:'#9dffcf',banner:'Recovery',bannerSub:'the tests pass again'};
      case 'refactor.validated':return {text:'Refactor validated · the organism reshapes',sub:plural(d.removedSymbols||0,'symbol')+' removed',position:pos,banner:'Refactor validated',bannerSub:'verified by a passing test run'};
      case 'milestone.achieved':{const k=(d.kinds||[]).map(x=>MILESTONE[x]||x);return {text:`A fractal bloom · ${k.join(' + ')}`,sub:'verified by a passing test run',position:pos,banner:k.join(' · '),bannerSub:'milestone · verified by a passing test run'};}
      case 'repository.checkpoint':return {text:`Committed · spores of ${plural(n,'branch').replace('branchs','branches')} rise`,sub:'commit observed',position:pos};
      case 'world.expanded':return {text:`The ecosystem grows · chapter ${d.chapter}`,sub:'accumulated structure',position:centre.clone().setY(2)};
      default:return null;}}
  function agentPosition(id){return agentState.get(id)?.pos||null;}
  function agentColor(a){return '#'+AGENT_COLORS[a.voice%8].getHexString();}
  function subsystemLabels(){return [...orgs.values()].map(o=>({position:o.root.clone().setY((o.canopy||o.height)+.8),text:ctx.name(o.id),sub:`${model.districts.get(o.id)?.role||''} · ${plural(o.members.length,'module')}`}));}
  function status(i){let v=0,st=0;for(const m of model.modules.values()){if(!model.alive(m,i.t))continue;const s=model.stateAt(m,i.t);if(s==='validated')v++;if(s==='stressed')st++;}return st?`${st} under blight`:v?`${v} validated`:'';}
  function pick(x,y,cam,i){let best=null,bd=.05;for(const [id,b] of branchOf){const p=swayed(b.tip,b.flex,i.tview).project(cam);const d=Math.hypot(p.x-x,(p.y-y)*.6);if(p.z<1&&d<bd){bd=d;best=id;}}
    if(!best)for(const o of orgs.values()){const p=o.root.clone().setY(o.height*.5).project(cam);const d=Math.hypot(p.x-x,p.y-y);if(p.z<1&&d<bd*2){bd=d;best='org:'+o.id;}}return best;}
  function inspect(id,i){if(!id)return null;if(id.startsWith('org:')){const o=orgs.get(id.slice(4));return o?{position:o.top.clone(),text:orgName(o.id),sub:`${plural(o.members.length,'module')} · organism of this subsystem`}:null;}
    const m=model.modules.get(id),b=branchOf.get(id);if(!m||!b)return null;const deps=[...model.links.values()].filter(l=>(l.a===id||l.b===id)&&model.alive(l,i.t)).length;
    return {position:swayed(b.tip,b.flex,i.tview),text:`A branch · ${model.stateAt(m,i.t)}`,sub:`${plural(model.symbolsAt(m,i.t),'leaf').replace('leafs','leaves')} · ${plural(deps,'vine')} · ${ctx.name(m.group)}`};}
  function stats(){return {organisms:orgs.size,segments:segCount,leaves:leafCount,vines:vineCount,spores:sporeCount,species,terrain,camera:camera.position.toArray().map(x=>+x.toFixed(1)),extent:+extent.toFixed(1)};}
  function dispose(){for(const o of [ground,barkMesh,leafMesh,vineMesh,sporePoints,agentPoints,burstPoints,crownMesh]){scene.remove(o);o.geometry.dispose();o.material.dispose();}sky.dispose();cyl.dispose();ribbon.dispose();}
  // After a seek: transient effects are cleared; lasting blooms are rebuilt from the verified milestones before t.
  function onPrime(t,tsec){for(const v of common.uWaves.value)v.w=-1e5;for(const v of ground.material.uniforms.uRipple.value)v.w=-1e5;for(const v of burstU.uBA.value)v.w=-1e5;flashes.length=0;
    crownCount=0;crownLevel.clear();crowns.commit(0);const keep=info;
    for(const c of ctx.director.commands){if(c.effect!=='fractal-bloom'||c.at>t)continue;info={...keep,tsec:(c.at-model.epoch)/1000};
      if(model.version!==builtVersion)build(t);const list=orgsOf(c.subject?.fileIds);for(const o of (list.length?list:[...orgs.values()].slice(0,1))){const lvl=(crownLevel.get(o.id)||0)+1;crownLevel.set(o.id,lvl);crown(o,lvl,pal.secondary,pal.valid);}}
    info=keep;}
  return {rebuild,update,afterCamera,background,grade,cameraGoal,effect,describe,agentPosition,agentColor,subsystemLabels,status,pick,inspect,stats,dispose,onPrime};
}

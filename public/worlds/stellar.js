// Stellar Forge: the software as a forming galaxy.
//
// Data -> image (nothing is decoration that claims engineering work):
//  - subsystem (district)  -> a star; temperature from what it contains (interface blue-white, services gold, model
//                             orange, logic pale yellow, tests violet), size from its symbols; it ignites when created
//  - file (module)         -> a planet orbiting its subsystem's star; orbit from its persisted plot (ring and bearing),
//                             surface from its content (UI: banded gas giant, types/classes: crystal, tests: ice,
//                             functions: terran, no symbols: moonlet); API routes: polar jets
//  - symbol                -> a moon / ring particle around its planet, in stable slot order; it spirals in when created
//  - material state        -> draft: molten protoplanet; committed: cooled world; validated: aurora; stressed: storms
//  - dependency            -> an energy ribbon between two planets; across subsystems a bright plasma bridge
//  - agent                 -> a comet: halo orbit while working on a request, at the planet it reads or edits while a
//                             tool runs, parked at the system's edge while waiting; it departs when the session ends
// Ambient life (never progress): nebula drift, star convection and corona, orbital motion, the turning dust disc,
// twinkling stars. Verified milestones unlock lasting layers (aurora veils, plasma currents, a pulsar, a halo).
import {THREE,NOISE,ORBIT,BACKGROUND_VS,clamp,lerp,smooth,easeOut,hash,rand,rng,instancedBuffers,pointBuffers,orbitPos} from './core.js';
const MAX_SYS=48;
const ROLE_COLOR={interface:'#7fb2ff',services:'#ffc05e',model:'#ff8e4d',logic:'#ffd89a',tests:'#bb9cff',core:'#ffe7c2'};
const KIND_INDEX={function:0,method:1,class:2,'ui.component':3,interface:4,type:5,variable:6,'api.route':7};
const STATE_INDEX={draft:0,committed:1,validated:2,stressed:3};
const SQRT3=Math.sqrt(3);
const hexDistance=(aq,ar,bq,br)=>(Math.abs(aq-bq)+Math.abs(aq+ar-bq-br)+Math.abs(ar-br))/2;
const secs=(t,epoch)=>Number.isFinite(t)?(t-epoch)/1000:(t>0?1e6:-1e5);
export function createFamily(ctx){
  const {scene,camera,model,recipe}=ctx;const G=recipe.genome,P=G.palette;
  const col=c=>new THREE.Color(c);
  const pal={primary:col(P.primary),secondary:col(P.secondary),accent:col(P.accent),highlight:col(P.highlight),deep:col(P.deep),haze:col(P.haze),warning:col(P.warning),valid:col(P.valid)};
  const seed=recipe.projectSeed>>>0;
  const common={uT:{value:0},uV:{value:0},uSpeed:{value:1},uSys:{value:Array.from({length:MAX_SYS},()=>new THREE.Vector4())},uPx:{value:1},uRes:{value:new THREE.Vector2(1920,1080)},
    uBeat:{value:0},uActivity:{value:0},uIntensity:{value:1},uMotion:{value:1}};
  // ---- Stars ---------------------------------------------------------------------------------------------------
  const starBase=new THREE.IcosahedronGeometry(1,5);
  const stars=instancedBuffers(starBase,{iStar:4,iStarColor:3},16);
  const starMat=new THREE.ShaderMaterial({uniforms:{...common,uGran:{value:G.secondary.granulation*G.motion.convection}},
    vertexShader:`attribute vec4 iStar;attribute vec3 iStarColor;uniform vec4 uSys[${MAX_SYS}];uniform float uT,uV,uSpeed,uBeat;
      varying vec3 vN,vP,vC,vW;varying vec4 vS;varying float vFlash;
      void main(){vec4 sys=uSys[int(iStar.x)];float age=(uT-iStar.y)/uSpeed;
        float grow=age<0.?0.:(age<2.2?1.18*smoothstep(0.,1.4,age)-.18*smoothstep(1.4,2.2,age):1.);
        float flare=iStar.z>-1e4?exp(-max(0.,(uT-iStar.z)/uSpeed)*.9):0.;
        float r=sys.w*grow*(1.+.03*uBeat+.12*flare);vP=position;vN=normal;vC=iStarColor;vS=iStar;vFlash=flare+(age<1.5&&age>0.?1.-age/1.5:0.);
        vec3 w=sys.xyz+position*r;vW=w;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`${NOISE}uniform float uV,uGran;varying vec3 vN,vP,vC,vW;varying vec4 vS;varying float vFlash;
      void main(){vec3 n=normalize(vN);vec3 v=normalize(cameraPosition-vW);float mu=max(0.,dot(n,v));
        float t=uV*.12*uGran;vec3 p=vP*3.2;
        float g=fbm3(p+vec3(t,t*.7,-t))*.5+.5;float cells=1.-abs(gnoise(p*2.6+vec3(0.,t*1.6,0.)));
        float spots=smoothstep(.62,.8,gnoise(vP*2.+vec3(t*.3)))*vS.w;
        vec3 hot=mix(vC,vec3(1.,.95,.85),.25);vec3 c=mix(vC*.32,hot,smoothstep(.2,1.,g*.6+cells*.55));
        c*=(.25+.75*pow(mu,.7));c*=1.-spots*.85;c+=vC*pow(1.-mu,4.)*.35;
        c*=.95+vFlash*6.+vS.w*.5*sin(uV*9.+vP.x*7.);gl_FragColor=vec4(c,1.);}`});
  const starMesh=new THREE.Mesh(stars.geometry,starMat);starMesh.frustumCulled=false;scene.add(starMesh);
  // Coronae: camera-facing billboards sharing the star instances (rays, loops, a soft glow far into space).
  const coronaGeo=new THREE.InstancedBufferGeometry();const quad=new THREE.PlaneGeometry(2,2);coronaGeo.index=quad.index;coronaGeo.setAttribute('position',quad.attributes.position);coronaGeo.setAttribute('uv',quad.attributes.uv);
  const coronaMat=new THREE.ShaderMaterial({uniforms:{...common,uCorona:{value:G.secondary.corona},uLoops:{value:G.secondary.loops}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 iStar;attribute vec3 iStarColor;uniform vec4 uSys[${MAX_SYS}];uniform float uT,uSpeed,uBeat;varying vec2 vUv;varying vec3 vC;varying vec4 vS;varying float vFlash,vGrow;
      void main(){vec4 sys=uSys[int(iStar.x)];float age=(uT-iStar.y)/uSpeed;vGrow=clamp(age/1.6,0.,1.);float flare=iStar.z>-1e4?exp(-max(0.,(uT-iStar.z)/uSpeed)*.7):0.;vFlash=flare;
        float s=sys.w*(2.4+2.2*flare+.1*uBeat)*vGrow;vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
        vec3 w=sys.xyz+(right*position.x+up*position.y)*s;vUv=position.xy;vC=iStarColor;vS=iStar;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`${NOISE}uniform float uV,uCorona,uLoops;varying vec2 vUv;varying vec3 vC;varying vec4 vS;varying float vFlash,vGrow;
      void main(){float r=length(vUv);if(r>1.)discard;float a=atan(vUv.y,vUv.x);float rs=1./2.4;float fall=(1.-r)*(1.-r);
        float glow=(exp(-(r-rs)*11.)*step(rs*.94,r)*.8+exp(-r*4.5)*.18)*fall;
        float rays=pow(max(0.,fbm3(vec3(cos(a)*2.,sin(a)*2.,uV*.08))*.5+.5),3.)*exp(-(r-rs)*6.)*fall;
        float prom=0.;for(int i=0;i<6;i++){if(float(i)>=uLoops)break;float fi=float(i);float ang=fi*1.83+vS.x*2.1+sin(uV*.04+fi)*.4;
          float da=abs(mod(a-ang+3.1416,6.2832)-3.1416);prom+=exp(-da*da*90.)*exp(-pow((r-rs*1.12)/(rs*.1),2.))*(.4+.6*sin(uV*.3+fi*2.)*sin(uV*.3+fi*2.));}
        vec3 c=vC*(glow*.75+rays*.8*uCorona+prom*.5*uCorona)+vec3(1.,.95,.85)*vFlash*exp(-r*5.)*fall*1.6;
        c*=(1.+vS.w*.6)*vGrow;gl_FragColor=vec4(c,1.);}`});
  coronaGeo.setAttribute('iStar',stars.geometry.attributes.iStar);coronaGeo.setAttribute('iStarColor',stars.geometry.attributes.iStarColor);
  const coronaMesh=new THREE.Mesh(coronaGeo,coronaMat);coronaMesh.frustumCulled=false;coronaMesh.renderOrder=2;scene.add(coronaMesh);
  // ---- Planets ----------------------------------------------------------------------------------------------------
  const planets=instancedBuffers(new THREE.IcosahedronGeometry(1,4),{iOrbit:4,iTilt:3,iLife:4,iLook:4,iColor:3,iGlow:2},64);
  const planetMat=new THREE.ShaderMaterial({uniforms:{...common,uValid:{value:pal.valid},uStress:{value:pal.warning},uDraft:{value:new THREE.Color('#ff8a3c')},uContrast:{value:G.material.surfaceContrast}},
    vertexShader:`${ORBIT}attribute vec4 iOrbit,iLife,iLook;attribute vec3 iTilt,iColor;attribute vec2 iGlow;uniform vec4 uSys[${MAX_SYS}];uniform float uT,uV,uSpeed;
      varying vec3 vN,vW,vL,vC,vToStar;varying vec4 vLook,vLife;varying vec2 vGlow;varying float vBirth;
      void main(){vec4 sys=uSys[int(iTilt.z)];float age=(uT-iLife.x)/uSpeed;float gone=iLife.y<1e5?clamp((uT-iLife.y)/uSpeed/1.4,0.,1.):0.;
        float grow=smoothstep(0.,1.8,age)*(1.-gone);vBirth=age>0.&&age<.9?1.-age/.9:0.;
        vec3 c=orbitPos(sys.xyz,iOrbit.x,iOrbit.y,iOrbit.z,iTilt.xy,uV);
        float spin=uV*(.25+fract(iGlow.y*13.)*.3);float cs=cos(spin),sn=sin(spin);vL=vec3(position.x*cs-position.z*sn,position.y,position.x*sn+position.z*cs);
        vec3 w=c+position*iOrbit.w*grow;vW=w;vN=normal;vC=iColor;vLook=iLook;vLife=iLife;vGlow=iGlow;vToStar=normalize(sys.xyz-c);
        gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`${NOISE}uniform float uT,uV,uSpeed,uContrast;uniform vec3 uValid,uStress,uDraft;
      varying vec3 vN,vW,vL,vC,vToStar;varying vec4 vLook,vLife;varying vec2 vGlow;varying float vBirth;
      vec3 surface(float style,vec3 q,float s){float f=fbm3(q*2.2+s);
        if(style<.5){float b=sin(q.y*9.+f*4.5+s)*.5+.5;vec3 c=mix(vC*.5,vC*1.25,b);return mix(c,vec3(1.),pow(b,9.)*.3);}
        if(style<1.5){float ridge=1.-abs(gnoise(q*3.1+s));return mix(vC*.3,vC*1.15+.1,pow(ridge,2.2*uContrast));}
        if(style<2.5){return mix(vec3(.72,.84,1.),vC*1.25,.3+.4*f);}
        if(style<3.5){float land=smoothstep(-.05,.25,f);return mix(vC*.35+vec3(.02,.05,.12),vC*1.05,land);}
        return vec3(.32)*(.7+.6*f)+vC*.12;}
      vec3 stateLight(float st,vec3 c,vec3 q,float rim,float s){
        if(st<.5){float cracks=smoothstep(.6,.95,1.-abs(gnoise(q*4.2+vec3(uV*.25))));return mix(c*.45,uDraft*2.6,cracks*.85)+uDraft*rim*.9;}
        if(st>2.5){float storm=smoothstep(.15,.75,fbm3(q*3.+vec3(0.,uV*.7,0.)));return mix(c,uStress*2.4,storm*.75)+uStress*rim*(1.2+.6*sin(uV*6.+s*7.));}
        if(st>1.5){float pole=smoothstep(.5,.95,abs(q.y));float curtain=.5+.5*sin(atan(q.z,q.x)*7.+uV*1.2+fbm3(q*2.+uV*.1)*3.);return c+uValid*(pole*curtain*1.8+rim*.85);}
        return c+vC*rim*.15;}
      void main(){vec3 n=normalize(vN);vec3 v=normalize(cameraPosition-vW);vec3 L=normalize(vToStar);float s=vGlow.y*17.;
        vec3 base=surface(vLook.x,vL,s);float diff=max(0.,dot(n,L));float rim=pow(1.-max(0.,dot(n,v)),3.);
        vec3 c=base*(.03+.85*diff);c+=vC*rim*.45*(dot(n,L)*.5+.5);
        float k=clamp((uT-vLife.z)/uSpeed/1.4,0.,1.);
        c=mix(stateLight(vLook.z,c,vL,rim,s),stateLight(vLook.y,c,vL,rim,s),k);
        c+=vC*vGlow.x*(1.3*rim+.25)+vec3(1.,.96,.9)*vBirth*4.;gl_FragColor=vec4(c,1.);}`});
  const planetMesh=new THREE.Mesh(planets.geometry,planetMat);planetMesh.frustumCulled=false;scene.add(planetMesh);
  // Polar jets for planets that expose API routes ("endpoints reaching out").
  const jets=instancedBuffers(new THREE.PlaneGeometry(1,1),{jOrbit:4,jTilt:3,jInfo:4,jColor:3},16);
  const jetMat=new THREE.ShaderMaterial({uniforms:common,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:`${ORBIT}attribute vec4 jOrbit,jInfo;attribute vec3 jTilt,jColor;uniform vec4 uSys[${MAX_SYS}];uniform float uT,uV,uSpeed;varying vec2 vUv;varying vec3 vC;varying float vA;
      void main(){vec4 sys=uSys[int(jTilt.z)];vec3 c=orbitPos(sys.xyz,jOrbit.x,jOrbit.y,jOrbit.z,jTilt.xy,uV);
        float age=(uT-jInfo.x)/uSpeed;vA=smoothstep(0.,2.5,age)*(jInfo.y<1e5?1.-clamp((uT-jInfo.y)/uSpeed,0.,1.):1.);
        float ca=cos(jTilt.x),sa=sin(jTilt.x),cb=cos(jTilt.y),sb=sin(jTilt.y);vec3 axis=normalize(vec3(-sb*ca,cb*ca,sa));
        vec3 side=normalize(cross(axis,cameraPosition-c));float len=jOrbit.w*(3.+jInfo.z*1.2)*(1.+.08*sin(uV*3.+jOrbit.y));
        vec3 w=c+axis*position.y*len*2.+side*position.x*jOrbit.w*.9*(1.-abs(position.y)*1.2);vUv=position.xy;vC=jColor;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`uniform float uV;varying vec2 vUv;varying vec3 vC;varying float vA;
      void main(){float y=abs(vUv.y)*2.;float x=abs(vUv.x)*2.;float core=exp(-x*x*6./(1.-y*.8+.01))*(1.-y);float knots=.6+.4*sin(y*30.-uV*8.);
        gl_FragColor=vec4(vC*core*knots*2.2*vA,1.);}`});
  const jetMesh=new THREE.Mesh(jets.geometry,jetMat);jetMesh.frustumCulled=false;scene.add(jetMesh);
  // ---- Moons (symbols) ------------------------------------------------------------------------------------------
  const moons=pointBuffers({mOrbit:4,mTilt:3,mMoon:4,mLife:4,mColor:3},256);
  const moonMat=new THREE.ShaderMaterial({uniforms:{...common,uRings:{value:G.secondary.moonsAsRings?1:0}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`${ORBIT}attribute vec4 mOrbit,mMoon,mLife;attribute vec3 mTilt,mColor;uniform vec4 uSys[${MAX_SYS}];uniform float uT,uV,uSpeed,uPx,uRings;varying vec3 vC;varying float vA;
      void main(){vec4 sys=uSys[int(mTilt.z)];vec3 pc=orbitPos(sys.xyz,mOrbit.x,mOrbit.y,mOrbit.z,mTilt.xy,uV);
        float age=(uT-mLife.x)/uSpeed;float gone=mLife.y<1e5?clamp((uT-mLife.y)/uSpeed/1.6,0.,1.):0.;float pg=mLife.w<1e5?clamp((uT-mLife.w)/uSpeed/1.4,0.,1.):0.;
        float spiral=1.-smoothstep(0.,1.7,age);float R=mOrbit.w*mMoon.x*(1.+spiral*2.5+gone*2.);
        float a=mMoon.y+uV*mMoon.z+spiral*4.;float incl=mix(sin(mMoon.y*3.7)*.5,.08,uRings);
        vec3 off=vec3(cos(a)*R,sin(a)*R*incl,sin(a)*R);vec3 w=pc+off;
        float weld=exp(-max(0.,(uT-mLife.z)/uSpeed)*3.)*step(mLife.z,uT);
        vA=smoothstep(0.,.4,age)*(1.-gone)*(1.-pg)*(1.+spiral*2.+weld*2.);vC=mColor;
        vec4 mv=viewMatrix*vec4(w,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(mMoon.w*uPx*(1.+spiral*1.5+weld)*22./max(.5,-mv.z),1.,48.);}`,
    fragmentShader:`varying vec3 vC;varying float vA;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;float a=exp(-r*3.5)+exp(-r*18.)*1.5;gl_FragColor=vec4(vC*a*vA,1.);}`});
  const moonPoints=new THREE.Points(moons.geometry,moonMat);moonPoints.frustumCulled=false;moonPoints.renderOrder=3;scene.add(moonPoints);
  // ---- Dependencies: ribbons between orbiting planets, extruded in screen space -----------------------------------
  const SEG=24;const ribbon=(()=>{const g=new THREE.BufferGeometry(),t=[],side=[],idx=[];
    for(let i=0;i<=SEG;i++){t.push(i/SEG,i/SEG);side.push(-1,1);if(i<SEG){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}}
    g.setAttribute('position',new THREE.Float32BufferAttribute(new Array((SEG+1)*2*3).fill(0),3));g.setAttribute('aT',new THREE.Float32BufferAttribute(t,1));g.setAttribute('aSide',new THREE.Float32BufferAttribute(side,1));g.setIndex(idx);return g;})();
  const links=instancedBuffers(ribbon,{iA:4,iAT:4,iB:4,iBT:4,iInfo:4,iColA:3,iColB:3},128);
  const linkMat=new THREE.ShaderMaterial({uniforms:{...common,uFlow:{value:G.motion.turbulence}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:`${ORBIT}attribute float aT,aSide;attribute vec4 iA,iAT,iB,iBT,iInfo;attribute vec3 iColA,iColB;uniform vec4 uSys[${MAX_SYS}];uniform float uT,uV,uSpeed,uPx;uniform vec2 uRes;
      varying float vT,vSide,vA,vCross,vSeed;varying vec3 vC;
      vec3 curve(vec3 a,vec3 b,float lift,float t){vec3 m=(a+b)*.5+vec3(0.,lift,0.);float u=1.-t;return u*u*a+2.*u*t*m+t*t*b;}
      void main(){vec3 a=orbitPos(uSys[int(iA.w)].xyz,iA.x,iA.y,iA.z,iAT.xy,uV),b=orbitPos(uSys[int(iB.w)].xyz,iB.x,iB.y,iB.z,iBT.xy,uV);
        float d=distance(a,b);float lift=iInfo.z>.5?(1.2+.28*d):(.15+.12*d);
        float t0=clamp(aT,0.,1.),t1=clamp(aT+.01,0.,1.);vec3 p=curve(a,b,lift,t0),q=curve(a,b,lift,aT<.99?t1:t0-.01);
        vec4 cp=projectionMatrix*viewMatrix*vec4(p,1.),cq=projectionMatrix*viewMatrix*vec4(q,1.);
        vec2 sp=cp.xy/cp.w,sq=cq.xy/cq.w;vec2 dir=normalize((aT<.99?sq-sp:sp-sq)*uRes+1e-5);vec2 nrm=vec2(-dir.y,dir.x);
        float age=(uT-iInfo.x)/uSpeed;float grow=clamp(age/(iInfo.z>.5?1.8:.9),0.,1.);float gone=iInfo.y<1e5?clamp((uT-iInfo.y)/uSpeed/.9,0.,1.):0.;
        float w=(iInfo.z>.5?3.2:1.3)*uPx*(1.+(1.-smoothstep(0.,3.,age))*1.5);
        cp.xy+=nrm*aSide*w/uRes*2.*cp.w;gl_Position=cp;
        vT=aT;vSide=aSide;vA=(aT<=grow?1.:0.)*(1.-gone);vCross=iInfo.z;vSeed=iInfo.w;vC=mix(iColA,iColB,aT);}`,
    fragmentShader:`uniform float uV,uFlow,uActivity;varying float vT,vSide,vA,vCross,vSeed;varying vec3 vC;
      void main(){if(vA<.01)discard;float edge=1.-vSide*vSide;float p=fract(vT*(vCross>.5?3.:2.)-uV*(.12+.15*uFlow)*(1.+uActivity)+vSeed);
        float pulse=smoothstep(0.,.05,p)*smoothstep(.22,.05,p);float base=vCross>.5?.9:.16;
        gl_FragColor=vec4(vC*edge*(base+pulse*(vCross>.5?2.6:.9))*vA,1.);}`});
  const linkMesh=new THREE.Mesh(links.geometry,linkMat);linkMesh.frustumCulled=false;linkMesh.renderOrder=1;scene.add(linkMesh);
  // ---- Galactic dust disc and starfield (ambient) ----------------------------------------------------------------
  // The recipe's arrangement shapes the whole galaxy: spiral arms, a ring, two cores with tidal streams, or a
  // spheroidal cluster. Systems are placed on the same structure (see place()), so the disc and the architecture agree.
  const ARR=G.geometry.arrangement,ARMS=G.geometry.spiralArms,PITCH=.3/G.geometry.spiralTwist,ARM0=rand(seed+31)*6.283,R0=6;
  // One logarithmic spiral for the arms of dust and the systems on them: theta = arm angle + ln(r / R0) / tan(pitch).
  const armAngle=(arm,r)=>ARM0+arm/ARMS*Math.PI*2+Math.log(Math.max(.5,r)/R0)/Math.tan(PITCH);
  const dustCount=Math.round(Math.max(9000,G.limits.maxParticles*1.1)*(.7+.3*G.atmosphere.dust));
  const dust=pointBuffers({dR:4,dC:3,dA:2},dustCount);
  {const r=rng(hash(`dust/${seed}/${ARR}`));const gauss=()=>(r()+r()+r()+r()-2)*.866;
    const blue=pal.accent.clone().lerp(new THREE.Color('#a9d0ff'),.55),pink=pal.secondary.clone().lerp(new THREE.Color('#ff6fae'),.55),warm=pal.highlight.clone().lerp(new THREE.Color('#ffd49a'),.7),haze=pal.primary.clone().lerp(pal.secondary,.5);
    for(let i=0;i<dustCount;i++){
      const kind=r();let rho,theta,h,size,c,b,onSpiral=0;
      if(kind<.16){rho=Math.abs(gauss())*.16;theta=r()*6.283;h=gauss()*.06*(1-rho*3);size=1.4+r()*2.6;c=warm.clone();b=.55+r()*.6;}           // bulge
      else if(ARR==='cluster'){rho=Math.pow(r(),1.6)*.95;theta=r()*6.283;h=gauss()*.5*(1-rho*.5);size=.8+r()*2;c=(r()<.7?warm:blue).clone();b=.35+r()*.5;}
      else if(ARR==='ring'){rho=kind<.78?.62+gauss()*.07:Math.pow(r(),.7)*1.05;theta=r()*6.283;h=gauss()*.03;size=.8+r()*2.4;c=(kind<.78?(r()<.25?pink:blue):haze).clone();b=kind<.78?.5+r()*.7:.18+r()*.3;}
      else if(ARR==='binary-core'&&kind<.5){const side=r()<.5?0:Math.PI;const k=r();rho=.2+k*.6;theta=ARM0+side+k*2.6+gauss()*.15;h=gauss()*.04;size=.8+r()*2.2;c=(r()<.3?pink:blue).clone();b=.4+r()*.5;}
      else if(ARR==='binary-core'&&kind<.6){const side=r()<.5?0:Math.PI;rho=Math.abs(gauss())*.1;theta=r()*6.283;const ox=Math.cos(ARM0+side)*.2,oz=Math.sin(ARM0+side)*.2;const x=ox+Math.cos(theta)*rho,z=oz+Math.sin(theta)*rho;rho=Math.hypot(x,z);theta=Math.atan2(z,x);h=gauss()*.05;size=1.2+r()*2;c=warm.clone();b=.5+r()*.5;}
      else{const arm=Math.floor(r()*ARMS),onArm=kind<.82;rho=Math.pow(r(),.75)*1.08+.06;onSpiral=onArm?1:0;
        theta=onArm?ARM0+arm/ARMS*Math.PI*2+gauss()*(.1+.2*rho):r()*6.283;h=gauss()*.035*(1.2-rho);size=(onArm?1:.7)*(.8+r()*2.4);
        const knot=onArm&&r()<.12;c=(knot?pink:onArm?blue:haze).clone();b=(onArm?.45:.16)*(.6+r()*.8)*(knot?1.8:1);}
      c.lerp(new THREE.Color(1,1,1),r()*.15);
      dust.write('position',i,0,0,0);dust.write('dR',i,rho,theta,h,size);dust.write('dC',i,c.r*b,c.g*b,c.b*b);dust.write('dA',i,onSpiral,r());}
    dust.commit(dustCount);}
  const dustMat=new THREE.ShaderMaterial({uniforms:{...common,uR0:{value:R0},uPitch:{value:PITCH},uDisc:{value:20},uWave:{value:new THREE.Vector4(0,0,-100,0)},uDust:{value:G.atmosphere.dust},uOrbitK:{value:G.motion.orbitSpeed}},
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 dR;attribute vec3 dC;attribute vec2 dA;uniform float uV,uDisc,uPx,uOrbitK,uActivity,uMotion,uR0,uPitch;uniform vec4 uWave;varying vec3 vC;varying float vA;
      void main(){float r=dR.x*uDisc;
        // Local motion only (drift along the arm, breathing), so the arms stay aligned with the systems on them.
        float th=dR.y+(dA.x>.5?log(max(.5,r)/uR0)/tan(uPitch):0.)+sin(uV*.05*uOrbitK*uMotion+dA.y*40.)*.03;
        vec3 p=vec3(cos(th)*r,dR.z*uDisc*(1.+.15*sin(uV*.1+dA.y*20.)),sin(th)*r);
        float wr=(uV-uWave.z)*uDisc*.35;float env=uWave.w*exp(-pow((r-wr)/(uDisc*.08),2.))*exp(-(uV-uWave.z)*.25);p.y+=env*sin((r-wr)*.8)*1.2;
        vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;float ps=dR.w*uPx*uDisc*2.2/max(1.,-mv.z);gl_PointSize=clamp(ps,1.,8.*uPx);
        vC=dC*(1.+env*3.)*min(1.,ps*ps*.6)*smoothstep(1.5,5.,-mv.z);vA=1.+uActivity*.2;}`,
    fragmentShader:`uniform float uDust;varying vec3 vC;varying float vA;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC*exp(-r*3.)*(.5+.55*uDust)*vA,1.);}`});
  const dustPoints=new THREE.Points(dust.geometry,dustMat);dustPoints.frustumCulled=false;scene.add(dustPoints);
  // Glowing gas: a few hundred very large, faint clouds on the same structure, so the arms read as luminous gas.
  const gasCount=Math.round(700+500*G.atmosphere.nebulaDensity),gas=pointBuffers({dR:4,dC:3,dA:2},gasCount);
  {const r=rng(hash(`gas/${seed}/${ARR}`));const gauss=()=>(r()+r()+r()+r()-2)*.866;const cols=[pal.secondary.clone().lerp(new THREE.Color('#ff5fa2'),.5),pal.accent.clone().lerp(new THREE.Color('#7fb4ff'),.5),pal.primary,pal.highlight.clone().lerp(new THREE.Color('#ffcf8a'),.5)];
    for(let i=0;i<gasCount;i++){let rho,theta,h,sp=0;const k=r();
      if(k<.12){rho=Math.abs(gauss())*.14;theta=r()*6.283;h=gauss()*.04;}
      else if(ARR==='cluster'){rho=Math.pow(r(),1.3)*.9;theta=r()*6.283;h=gauss()*.4;}
      else if(ARR==='ring'||(ARR==='binary-core'&&k>.6)){rho=.62+gauss()*.1;theta=r()*6.283;h=gauss()*.03;}
      else{rho=.12+Math.pow(r(),.8)*.95;theta=ARM0+Math.floor(r()*ARMS)/ARMS*6.283+gauss()*(.15+.15*rho);h=gauss()*.03;sp=1;}
      const c=(k<.12?cols[3]:cols[Math.floor(r()*3)]).clone();const b=(k<.12?.05:.035)*(.5+r());
      gas.write('position',i,0,0,0);gas.write('dR',i,rho,theta,h,(k<.12?9:6)+r()*9);gas.write('dC',i,c.r*b,c.g*b,c.b*b);gas.write('dA',i,sp,r());}
    gas.commit(gasCount);}
  const gasMat=dustMat.clone();gasMat.uniforms=dustMat.uniforms;
  gasMat.vertexShader=dustMat.vertexShader.replace('gl_PointSize=clamp(ps,1.,8.*uPx);','gl_PointSize=clamp(ps*4.,2.,180.*uPx);').replace('*min(1.,ps*ps*.6)*smoothstep(1.5,5.,-mv.z)','*smoothstep(2.,9.,-mv.z)');
  gasMat.fragmentShader=`uniform float uDust;varying vec3 vC;varying float vA;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC*exp(-r*2.2)*(1.-r)*vA,1.);}`;
  const gasPoints=new THREE.Points(gas.geometry,gasMat);gasPoints.frustumCulled=false;gasPoints.renderOrder=-1;scene.add(gasPoints);
  const starCount=Math.round(2400+2600*G.atmosphere.stars),sky=pointBuffers({sInfo:4},starCount);
  {const r=rng(hash(`sky/${seed}`));for(let i=0;i<starCount;i++){const u=r()*2-1,a=r()*Math.PI*2,s=Math.sqrt(1-u*u);sky.write('position',i,Math.cos(a)*s*1500,u*1500,Math.sin(a)*s*1500);sky.write('sInfo',i,Math.pow(r(),3)*1.6+.25,r()*6.283,.5+r()*2.5,r());}sky.commit(starCount);}
  const skyMat=new THREE.ShaderMaterial({uniforms:common,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 sInfo;uniform float uV,uPx;varying float vB;varying float vT;void main(){vec4 mv=viewMatrix*vec4(position+cameraPosition,1.);gl_Position=projectionMatrix*mv;
      vB=sInfo.x*(.75+.25*sin(uV*sInfo.z+sInfo.y));vT=sInfo.w;gl_PointSize=clamp(sInfo.x*2.2*uPx,1.,5.);}`,
    fragmentShader:`varying float vB,vT;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;vec3 c=mix(vec3(.75,.85,1.),vec3(1.,.88,.75),vT);gl_FragColor=vec4(c*vB*exp(-r*3.),1.);}`});
  const skyPoints=new THREE.Points(sky.geometry,skyMat);skyPoints.frustumCulled=false;skyPoints.renderOrder=-1;scene.add(skyPoints);
  // Galactic core: the bulge at the centre (ambient light, not a structure).
  const coreGlow=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:{...common,uSize:{value:6},uCol:{value:pal.highlight.clone().lerp(pal.primary,.3)}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`uniform float uSize;varying vec2 vUv;void main(){vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);vUv=position.xy;gl_Position=projectionMatrix*viewMatrix*vec4((right*position.x+up*position.y*.6)*uSize,1.);}`,
    fragmentShader:`uniform vec3 uCol;uniform float uBeat,uActivity;varying vec2 vUv;void main(){float r=length(vUv);if(r>1.)discard;float fall=(1.-r)*(1.-r);gl_FragColor=vec4(uCol*(exp(-r*4.)*.7+exp(-r*14.)*1.2)*fall*(1.+.06*uBeat)*(.85+.25*uActivity),1.);}`}));
  coreGlow.frustumCulled=false;scene.add(coreGlow);
  // ---- Agents: comet heads, tails and work streams (one point cloud) ----------------------------------------------
  const TAIL=56,STREAM=28,MAX_AGENTS=10,agentPts=pointBuffers({aCol:4,aSize:1},MAX_AGENTS*(TAIL+STREAM));
  const agentMat=new THREE.ShaderMaterial({uniforms:common,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 aCol;attribute float aSize;uniform float uPx;varying vec4 vC;void main(){vec4 mv=viewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*uPx*40./max(.5,-mv.z),0.,64.);vC=aCol;}`,
    fragmentShader:`varying vec4 vC;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC.rgb*(exp(-r*4.)+exp(-r*20.)*2.)*vC.a,1.);}`});
  const agentPoints=new THREE.Points(agentPts.geometry,agentMat);agentPoints.frustumCulled=false;agentPoints.renderOrder=4;scene.add(agentPoints);
  // ---- Effects (pooled) -------------------------------------------------------------------------------------------
  const RINGS=16,rings=instancedBuffers(new THREE.PlaneGeometry(2,2),{rC:4,rP:4,rTilt:2,rColor:3},RINGS);rings.commit(RINGS);
  for(let i=0;i<RINGS;i++)rings.write('rC',i,0,0,0,-1e5);rings.flush();
  const ringMat=new THREE.ShaderMaterial({uniforms:common,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:`attribute vec4 rC,rP;attribute vec2 rTilt;attribute vec3 rColor;uniform float uT,uSpeed;varying vec2 vUv;varying vec3 vC;varying float vAge;varying vec4 vP;
      void main(){float age=(uT-rC.w)/uSpeed/rP.x;vAge=age;vP=rP;vC=rColor;float R=rP.y*(age<0.||age>1.?0.:pow(age,.6));
        vec3 p=vec3(position.x,0.,position.y)*R;float ca=cos(rTilt.x),sa=sin(rTilt.x);p=vec3(p.x,p.y*ca-p.z*sa,p.y*sa+p.z*ca);float cb=cos(rTilt.y),sb=sin(rTilt.y);p=vec3(p.x*cb-p.y*sb,p.x*sb+p.y*cb,p.z);
        vUv=position.xy;gl_Position=projectionMatrix*viewMatrix*vec4(rC.xyz+p,1.);}`,
    fragmentShader:`varying vec2 vUv;varying vec3 vC;varying float vAge;varying vec4 vP;void main(){if(vAge<0.||vAge>1.)discard;float r=length(vUv);float band=exp(-pow((r-.92)/(.04*vP.z),2.))+exp(-pow((r-.86)/(.12*vP.z),2.))*.35;
      gl_FragColor=vec4(vC*band*(1.-vAge)*vP.w*2.2,1.);}`});
  const ringMesh=new THREE.Mesh(rings.geometry,ringMat);ringMesh.frustumCulled=false;ringMesh.renderOrder=5;scene.add(ringMesh);let ringNext=0;
  const BURSTS=24,PER=48,burstPts=pointBuffers({bDir:4},BURSTS*PER);
  {const r=rng(hash(`burst/${seed}`));for(let b=0;b<BURSTS;b++)for(let k=0;k<PER;k++){const u=r()*2-1,a=r()*6.283,s=Math.sqrt(1-u*u);burstPts.write('position',b*PER+k,0,0,0);burstPts.write('bDir',b*PER+k,Math.cos(a)*s,u*.35,Math.sin(a)*s,b+r()*.9);}burstPts.commit(BURSTS*PER);}
  const burstU={uBA:{value:Array.from({length:BURSTS},()=>new THREE.Vector4(0,0,0,-1e5))},uBB:{value:Array.from({length:BURSTS},()=>new THREE.Vector4())},uBC:{value:Array.from({length:BURSTS},()=>new THREE.Vector4(1,0,1,0))}};
  const burstMat=new THREE.ShaderMaterial({uniforms:{...common,...burstU},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 bDir;uniform vec4 uBA[${BURSTS}],uBB[${BURSTS}],uBC[${BURSTS}];uniform float uT,uSpeed,uPx;varying vec3 vC;varying float vA;
      void main(){int b=int(bDir.w);float speed=fract(bDir.w);vec4 A=uBA[b],B=uBB[b],C=uBC[b];float age=(uT-A.w)/uSpeed/C.x;
        if(age<0.||age>1.){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;vA=0.;return;}
        float travel=C.y>.5?(1.-age)*C.z:(1.-pow(1.-age,2.5))*C.z*(.4+speed);vec3 p=A.xyz+bDir.xyz*travel;
        vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(B.w*uPx*26./max(.5,-mv.z)*(1.-age*.6),1.,24.);vC=B.rgb;vA=(1.-age)*(C.y>.5?age*2.:1.);}`,
    fragmentShader:`varying vec3 vC;varying float vA;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC*exp(-r*4.)*vA*2.,1.);}`});
  const burstPoints=new THREE.Points(burstPts.geometry,burstMat);burstPoints.frustumCulled=false;burstPoints.renderOrder=6;scene.add(burstPoints);let burstNext=0;
  const FLARES=8,flares=instancedBuffers(ribbon,{fP0:4,fP1:4,fInfo:4,fColor:3},FLARES);flares.commit(FLARES);for(let i=0;i<FLARES;i++)flares.write('fP0',i,0,0,0,-1e5);flares.flush();
  const flareMat=new THREE.ShaderMaterial({uniforms:common,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:`attribute float aT,aSide;attribute vec4 fP0,fP1,fInfo;attribute vec3 fColor;uniform float uT,uSpeed,uPx,uV;uniform vec2 uRes;varying float vT,vSide,vA,vAge;varying vec3 vC;
      vec3 curve(vec3 a,vec3 b,float lift,float t){vec3 m=(a+b)*.5+vec3(0.,lift,0.);float u=1.-t;return u*u*a+2.*u*t*m+t*t*b;}
      void main(){float age=(uT-fP0.w)/uSpeed/fP1.w;vAge=age;float lift=fInfo.x*(1.+.15*sin(uV*2.+aT*9.));
        vec3 p=curve(fP0.xyz,fP1.xyz,lift,aT),q=curve(fP0.xyz,fP1.xyz,lift,min(1.,aT+.01));if(aT>.99)q=p+(p-curve(fP0.xyz,fP1.xyz,lift,aT-.01));
        vec4 cp=projectionMatrix*viewMatrix*vec4(p,1.),cq=projectionMatrix*viewMatrix*vec4(q,1.);vec2 dir=normalize((cq.xy/cq.w-cp.xy/cp.w)*uRes+1e-5);vec2 n=vec2(-dir.y,dir.x);
        float w=fInfo.y*uPx*(1.+2.*exp(-age*6.))*(.6+.4*sin(aT*3.1416));cp.xy+=n*aSide*w/uRes*2.*cp.w;gl_Position=cp;
        vT=aT;vSide=aSide;vA=(age>=0.&&age<=1.&&aT<=clamp(age*3.2,0.,1.))?1.:0.;vC=fColor*fInfo.z;}`,
    fragmentShader:`uniform float uV;varying float vT,vSide,vA,vAge;varying vec3 vC;void main(){if(vA<.01)discard;float edge=exp(-vSide*vSide*2.5);float flick=.75+.25*sin(vT*40.-uV*14.);
      gl_FragColor=vec4(vC*edge*flick*(1.-smoothstep(.55,1.,vAge))*3.,1.);}`});
  const flareMesh=new THREE.Mesh(flares.geometry,flareMat);flareMesh.frustumCulled=false;flareMesh.renderOrder=6;scene.add(flareMesh);let flareNext=0;
  const waves=[],flashes=[];
  // ---- Nebula background (half resolution) ---------------------------------------------------------------------
  const nebulaStyle={filamentary:0,billowing:1,veil:2}[G.atmosphere.nebula]??1;
  const nebula=new THREE.ShaderMaterial({uniforms:{...common,uInv:{value:new THREE.Matrix4()},uCam:{value:new THREE.Vector3()},uDeep:{value:pal.deep},uHaze:{value:pal.haze},uA:{value:pal.secondary},uB:{value:pal.accent},
      uDensity:{value:G.atmosphere.nebulaDensity},uStyle:{value:nebulaStyle},uSeedV:{value:new THREE.Vector3(rand(seed)*40,rand(seed+1)*40,rand(seed+2)*40)},uUnlock:{value:new THREE.Vector4()},uBand:{value:new THREE.Vector3(0,1,0)}},
    vertexShader:BACKGROUND_VS,depthWrite:false,depthTest:false,
    fragmentShader:`${NOISE}varying vec2 vUv;uniform mat4 uInv;uniform vec3 uCam,uDeep,uHaze,uA,uB,uSeedV,uBand;uniform float uV,uDensity,uStyle,uBeat,uActivity;uniform vec4 uUnlock;
      void main(){vec4 p=uInv*vec4(vUv*2.-1.,1.,1.);vec3 d=normalize(p.xyz/p.w-uCam);vec3 q=d*2.2+uSeedV+vec3(uV*.004,uV*.002,-uV*.003);
        vec3 w=vec3(fbm3(q+vec3(uV*.006)),fbm3(q+vec3(5.2,1.3,uV*.005)),fbm3(q+vec3(9.1,4.7,2.)));float n=fbm5(q+w*1.6);
        float f=uStyle<.5?pow(1.-abs(n*2.),5.)*1.3:uStyle<1.5?smoothstep(-.15,.55,n):smoothstep(.0,.6,n)*(.6+.4*sin(d.y*9.+n*6.));
        float band=exp(-pow(dot(d,uBand)*2.4,2.));
        float lanes=1.-.75*smoothstep(.05,.35,fbm3(q*2.4+w*1.3+vec3(3.)));
        float wisp=pow(max(0.,f),1.6)*lanes;
        vec3 c=uDeep+uHaze*.22*band*lanes;
        c+=mix(uA,uB,smoothstep(-.3,.5,w.x))*wisp*uDensity*(.75+.5*band);
        c+=mix(uB,vec3(.55,.75,1.),.35)*pow(max(0.,n+.05),3.)*1.4*uDensity*lanes;
        c+=mix(uA,vec3(1.,.5,.72),.55)*pow(max(0.,fbm3(q*3.1+w*2.)),3.)*1.1*uDensity*lanes;
        float veil=uUnlock.x*smoothstep(.1,.7,fbm3(vec3(d.x*4.,d.y*9.-uV*.05,d.z*4.)))*exp(-pow(d.y*3.,2.));c+=mix(uA,vec3(.5,1.,.8),.5)*veil*.35;
        vec3 pd=normalize(vec3(.7,.25,-.6));float pulsar=uUnlock.z*exp(-acos(clamp(dot(d,pd),-1.,1.))*90.)*(.3+2.5*uBeat);c+=vec3(.75,.9,1.)*pulsar;
        gl_FragColor=vec4(c,1.);}`});
  // ---- Layout -------------------------------------------------------------------------------------------------------
  const sys=new Map();      // district id -> {index, pos, radius, sysR, tilt, color, role, born}
  const bodies=new Map();   // module id -> {index, orbit:[r,ph,w,size], tilt:[tx,tz], sysIndex, style, color}
  let ringR=null,discR=null,extent=6;
  const tmp=new THREE.Vector3(),tmp2=new THREE.Vector3();
  function districtList(t){return [...model.districts.values()].filter(d=>model.districtBorn(d)<=t).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));}
  function starRadius(d,t){let n=0;for(const id of d.members){const m=model.modules.get(id);if(m&&model.alive(m,t))n+=Math.max(1,model.symbolsAt(m,t));}return Math.min(1.45,(d.core?.75:.45)+.24*Math.log2(1+n)/2.2)*G.geometry.starScale;}
  function systemRadius(d,s){let k=0;for(const id of d.members){const m=model.modules.get(id);if(m)k=Math.max(k,hexDistance(m.q,m.r,d.q,d.r));}return 2.1*G.geometry.starScale+.4+k*.78*G.geometry.orbitSpacing+.8;}
  // Districts are placed by the recipe's arrangement from their persisted order and angle, so nothing ever jumps:
  // the galaxy only breathes outward (eased) as subsystems are added.
  // Systems are packed on the galaxy's structure so neighbours never overlap; the structure only grows (eased) as
  // subsystems are added or fill up, and every system keeps its order, so nothing jumps or reshuffles.
  function pack(list,coreSize){
    const out=new Map(),placed=[];const gap=(a,b)=>(a+b)*1.06;
    const free=(x,z,s)=>placed.every(p=>Math.hypot(p.x-x,p.z-z)>=gap(p.s,s));
    if(ARR==='spiral'){const last=new Array(ARMS).fill(null),big=Math.max(...list.map(d=>sys.get(d.id).sysR),1);
      list.forEach((d,k)=>{const s=sys.get(d.id).sysR,arm=k%ARMS;let r=last[arm]?last[arm]+gap(last[arm+ARMS]||s,s)*Math.sin(PITCH)*1.02:Math.max(coreSize+s+.8,big*1.15/Math.sin(Math.PI/Math.max(2,ARMS)));
        for(let i=0;i<400;i++){const a=armAngle(arm,r);const x=Math.cos(a)*r,z=Math.sin(a)*r;if(free(x,z,s)&&Math.hypot(x,z)>=coreSize+s+.6)break;r+=.25;}
        const a=armAngle(arm,r),h=rand(hash(d.id));const p={x:Math.cos(a)*r,y:(h-.5)*.6,z:Math.sin(a)*r,s};placed.push(p);out.set(d.id,p);last[arm]=r;last[arm+ARMS]=s;});
      return out;}
    if(ARR==='cluster'){const N=Math.max(12,list.length+4);list.forEach((d,k)=>{const s=sys.get(d.id).sysR;let R=coreSize+s+1;
        const y=1-(k+.5)/N*2,rr=Math.sqrt(1-y*y),phi=k*2.39996+ARM0;
        for(let i=0;i<400;i++){const x=Math.cos(phi)*rr*R,z=Math.sin(phi)*rr*R;if(placed.every(p=>Math.hypot(p.x-x,p.y-y*R*.55,p.z-z)>=gap(p.s,s)))break;R+=.3;}
        const p={x:Math.cos(phi)*rr*R,y:y*R*.55,z:Math.sin(phi)*rr*R,s};placed.push(p);out.set(d.id,p);});return out;}
    // Ring (and binary-core's outer systems): a circle at the layout's persisted bearings, radius set by the closest pair.
    let inner=list;if(ARR==='binary-core'){inner=list.slice(2);list.slice(0,2).forEach((d,k)=>{const s=sys.get(d.id).sysR,a=ARM0+(k?Math.PI:0),r=Math.max(coreSize+s+.6,s*1.1);const p={x:Math.cos(a)*r,y:0,z:Math.sin(a)*r,s};placed.push(p);out.set(d.id,p);});}
    const angles=inner.map(d=>d.angle).sort((a,b)=>a-b);let minSep=Math.PI*2;for(let i=0;i<angles.length;i++){const a=angles[i],b=i+1<angles.length?angles[i+1]:angles[0]+Math.PI*2;if(angles.length>1)minSep=Math.min(minSep,b-a);}
    const big=Math.max(1,...inner.map(d=>sys.get(d.id).sysR));
    let R=Math.max(coreSize+big+1,(ARR==='binary-core'?Math.max(...placed.map(p=>Math.hypot(p.x,p.z)+p.s),0)+big+1:0),inner.length>1?gap(big,big)/(2*Math.sin(Math.min(Math.PI/2,minSep/2))):0);
    for(const d of inner){const s=sys.get(d.id).sysR,h=rand(hash(d.id));const p={x:Math.cos(d.angle)*R,y:(h-.5)*.5,z:Math.sin(d.angle)*R,s};placed.push(p);out.set(d.id,p);}
    return out;
  }
  function updateLayout(t,dt,snap){
    const list=districtList(t);let maxSys=2;
    for(const d of list){const s=sys.get(d.id)||{};s.radius=starRadius(d,t);s.sysR=systemRadius(d,s.radius);maxSys=Math.max(maxSys,s.sysR);sys.set(d.id,s);}
    const core=list.find(d=>d.core),others=list.filter(d=>!d.core);
    const coreSize=core?sys.get(core.id).sysR:1.5;const packed=pack(others,coreSize);
    let outer=coreSize;for(const p of packed.values())outer=Math.max(outer,Math.hypot(p.x,p.z)+p.s);
    const targetR=Math.max(10,outer*(ARR==='ring'||ARR==='binary-core'?1.32:1.18))*G.space.spread;
    ringR=snap||ringR===null?targetR:lerp(ringR,targetR,Math.min(1,dt*.35));
    const grow=ringR/targetR;extent=4;
    for(const d of list){
      const s=sys.get(d.id);const idx=Math.min(MAX_SYS-1,d.order);const p=d.core?{x:0,y:0,z:0}:packed.get(d.id);
      const x=p.x*grow*G.space.spread,y=p.y,z=p.z*grow*G.space.spread;s.index=idx;
      if(!s.pos||snap)s.pos=new THREE.Vector3(x,y,z);else s.pos.lerp(tmp.set(x,y,z),Math.min(1,dt*.6));
      const role=d.role;s.role=role;s.color=new THREE.Color(ROLE_COLOR[role]||ROLE_COLOR.logic).lerp(pal.primary,.18);
      const h=hash(d.id);s.tilt=[(rand(h+3)-.5)*2*G.geometry.orbitTilt,(rand(h+7)-.5)*2*G.geometry.orbitTilt];s.born=model.districtBorn(d);s.d=d;
      common.uSys.value[idx].set(s.pos.x,s.pos.y,s.pos.z,s.radius);extent=Math.max(extent,Math.hypot(s.pos.x,s.pos.z)+s.sysR);
    }
    discR=ringR;dustMat.uniforms.uDisc.value=discR;coreGlow.material.uniforms.uSize.value=Math.max(3,discR*.32);extent=Math.max(extent,discR*.95);
    return list;
  }
  // ---- Bodies -----------------------------------------------------------------------------------------------------
  function styleOf(m){const c=m.counts||{};const total=Object.entries(c).filter(([k])=>k!=='property').reduce((a,[,v])=>a+v,0);
    if(m.test)return 2;if(!total)return 4;if((c['ui.component']||0)>0)return 0;if((c.class||0)+(c.interface||0)+(c.type||0)>=(c.function||0)*.6)return 1;return 3;}
  function bodyOf(m,t){
    const s=sys.get(m.group);if(!s)return null;const d=s.d;
    const k=hexDistance(m.q,m.r,d.q,d.r),h=hash(m.id);
    const wx=SQRT3*(m.q-d.q)+SQRT3/2*(m.r-d.r),wz=1.5*(m.r-d.r);const bearing=k?Math.atan2(wz,wx):rand(h)*6.283;
    const r=2.1*G.geometry.starScale+.4+k*.78*G.geometry.orbitSpacing+(rand(h+1)-.5)*.25+(k?0:.2);
    const w=.55*Math.pow(r,-1.5)*G.motion.orbitSpeed*1.6;
    const total=Object.entries(m.counts||{}).filter(([x])=>x!=='property'&&x!=='api.route').reduce((a,[,v])=>a+v,0);
    const size=Math.min(.62,(total?.15+.06*Math.sqrt(total):.09))*(m.test?.85:1);
    const style=styleOf(m);const c=(style===0?pal.secondary:style===1?pal.accent:style===2?pal.highlight:style===3?pal.primary:pal.highlight).clone().lerp(s.color,.15);
    {const hsl={};c.getHSL(hsl);c.setHSL(hsl.h+(rand(h+11)-.5)*.06,Math.min(1,hsl.s*1.15),Math.min(.62,hsl.l));}
    return {r,ph:bearing+(rand(h+2)-.5)*.6,w,size,tx:s.tilt[0]+(rand(h+4)-.5)*.12,tz:s.tilt[1]+(rand(h+5)-.5)*.12,sysIndex:s.index,style,color:c,routes:m.counts?.['api.route']||0,seed:rand(h+9)};
  }
  function bodyPos(out,b,tv){return orbitPos(out,common.uSys.value[b.sysIndex],b.r,b.ph,b.w,b.tx,b.tz,tv);}
  let builtVersion=-1,moduleIds=[],symbolIds=[],linkKeys=[];
  function rebuild(){builtVersion=-1;ringR=null;discR=null;for(const w of agentState.values())w.snap=true;}
  const agentState=new Map();
  function syncBodies(t){
    // Static per-instance data is rewritten when the model changes (new modules, symbols, links); per-frame data below.
    const epoch=model.epoch;
    moduleIds=[...model.modules.values()].filter(m=>sys.has(m.group)).sort((a,b)=>a.order-b.order).map(m=>m.id);
    planets.ensure(moduleIds.length);let jetN=0;
    moduleIds.forEach((id,i)=>{const m=model.modules.get(id);const b=bodyOf(m,t);if(!b)return;b.index=i;bodies.set(id,b);
      planets.write('iOrbit',i,b.r,b.ph,b.w,b.size);planets.write('iTilt',i,b.tx,b.tz,b.sysIndex);planets.write('iColor',i,b.color.r,b.color.g,b.color.b);
      planets.write('iLife',i,secs(m.born,epoch),m.removed===null?1e6:secs(m.removed,epoch),-1e5,0);
      if(b.routes){jets.ensure(jetN+1);jets.write('jOrbit',jetN,b.r,b.ph,b.w,b.size);jets.write('jTilt',jetN,b.tx,b.tz,b.sysIndex);jets.write('jInfo',jetN,secs(m.born,epoch),m.removed===null?1e6:secs(m.removed,epoch),Math.min(4,b.routes),0);
        const jc=pal.valid.clone().lerp(b.color,.4);jets.write('jColor',jetN,jc.r*1.6,jc.g*1.6,jc.b*1.6);jetN++;}});
    planets.commit(moduleIds.length);jets.commit(jetN);
    const kinds=[pal.highlight,pal.highlight.clone().multiplyScalar(.7),pal.accent.clone().multiplyScalar(1.6),pal.secondary.clone().multiplyScalar(1.6),pal.primary.clone().multiplyScalar(.6),pal.primary.clone().multiplyScalar(.45),new THREE.Color(.35,.38,.45),pal.valid];
    const sizes=[3.4,2.8,6.2,5.6,2.6,2.2,1.7,4.6];
    symbolIds=[];for(const s of model.symbols.values())if(bodies.has(s.parent))symbolIds.push(s.id);
    moons.ensure(symbolIds.length);
    symbolIds.forEach((id,i)=>{const s=model.symbols.get(id),b=bodies.get(s.parent),m=model.modules.get(s.parent);const k=KIND_INDEX[s.kind]??0,h=hash(id);
      moons.write('position',i,0,0,0);moons.write('mOrbit',i,b.r,b.ph,b.w,b.size);moons.write('mTilt',i,b.tx,b.tz,b.sysIndex);
      moons.write('mMoon',i,1.75+Math.min(14,s.slot)*.2+rand(h)*.15,rand(h+1)*6.283,(1.1+rand(h+2)*.6)/Math.sqrt(1.75+s.slot*.2),sizes[k]);
      const born=model.bornAt(s);moons.write('mLife',i,Number.isFinite(born)?secs(born,epoch):born===Infinity?1e6:-1e5,s.removed===null?1e6:secs(s.removed,epoch),Number.isFinite(s.weldAt)?secs(s.weldAt,epoch):-1e5,m.removed===null?1e6:secs(m.removed,epoch));
      const c=kinds[k];moons.write('mColor',i,c.r,c.g,c.b);});
    moons.commit(symbolIds.length);
    linkKeys=[];for(const l of model.links.values())if(bodies.has(l.a)&&bodies.has(l.b))linkKeys.push(l.key);
    links.ensure(linkKeys.length);
    linkKeys.forEach((key,i)=>{const l=model.links.get(key),a=bodies.get(l.a),b=bodies.get(l.b);const born=model.bornAt(l);
      links.write('iA',i,a.r,a.ph,a.w,a.sysIndex);links.write('iAT',i,a.tx,a.tz,a.size,0);links.write('iB',i,b.r,b.ph,b.w,b.sysIndex);links.write('iBT',i,b.tx,b.tz,b.size,0);
      links.write('iInfo',i,Number.isFinite(born)?secs(born,epoch):born===Infinity?1e6:-1e5,l.removed===null?1e6:secs(l.removed,epoch),l.cross?1:0,rand(hash(key)));
      const ca=sys.get(model.modules.get(l.a).group)?.color||pal.primary,cb=sys.get(model.modules.get(l.b).group)?.color||pal.primary;
      const k2=l.cross?1.25:.7;links.write('iColA',i,ca.r*k2,ca.g*k2,ca.b*k2);links.write('iColB',i,cb.r*k2,cb.g*k2,cb.b*k2);});
    links.commit(linkKeys.length);
    builtVersion=model.version;
  }
  // ---- Agents -----------------------------------------------------------------------------------------------------
  const AGENT_COLORS=['#ff9ee8','#ffd27a','#9dffcf','#a7b8ff','#ffb08a','#8ef0ff','#e2a6ff','#c9ff8a'].map(c=>new THREE.Color(c));
  function agentGoal(a,i,out){
    const tv=i.tview,b=a.fileId?bodies.get(a.fileId):null,home=a.home?bodies.get(a.home):null;
    const hs=home?[...sys.values()].find(s=>s.index===home.sysIndex):null;
    if(b&&a.display==='tool'){bodyPos(out,b,tv);const lift=b.size*2.2+.55;out.y+=lift;return out;}
    const phase=rand(hash(a.id))*6.283;
    if(hs){
      const R=a.display==='waiting'||a.display==='dormant'?hs.sysR+1.6:hs.sysR*.62+.8,speed=a.busy?.32:.07;
      return out.set(hs.pos.x+Math.cos(phase+tv*speed)*R,hs.pos.y+1.2+Math.sin(tv*.5+phase)*.35,hs.pos.z+Math.sin(phase+tv*speed)*R);}
    const R=(ringR||8)*.55;return out.set(Math.cos(phase+tv*.08)*R,1.6,Math.sin(phase+tv*.08)*R);
  }
  function updateAgents(i){
    const list=i.agents.slice(0,MAX_AGENTS);let n=0;const seen=new Set();
    for(const a of list){
      seen.add(a.id);let st=agentState.get(a.id);if(!st){st={pos:new THREE.Vector3(),trail:[],snap:true};agentState.set(a.id,st);}
      const goal=agentGoal(a,i,tmp.clone());
      if(st.snap){st.pos.copy(goal);st.trail=[];st.snap=false;}else st.pos.lerp(goal,Math.min(1,i.dt*(a.display==='tool'?2.2:1.2)));
      st.trail.unshift(st.pos.clone());if(st.trail.length>TAIL)st.trail.pop();
      const c=AGENT_COLORS[a.voice%8],alpha=a.alpha*(a.busy?1:.55)*G.agentProminence;
      st.trail.forEach((p,k)=>{if(n>=agentPts.capacity)return;const f=1-k/TAIL;agentPts.write('position',n,p.x,p.y,p.z);agentPts.write('aCol',n,c.r*(1+f),c.g*(1+f),c.b*(1+f),alpha*f*f*(k?0.8:1.6));agentPts.write('aSize',n,k?(.5+f*1.6)*G.agents.tail:3.4);n++;});
      // Work streams: particles flowing comet -> planet while editing, planet -> comet while reading.
      const b=a.fileId?bodies.get(a.fileId):null;
      if(b&&a.display==='tool'){const target=bodyPos(tmp2,b,i.tview);const inward=a.activity==='reading'||a.activity==='searching';
        for(let k=0;k<STREAM&&n<agentPts.capacity;k++){let f=((i.tview*.9+k/STREAM)%1);if(inward)f=1-f;
          const p=st.pos.clone().lerp(target,f);p.y+=Math.sin(f*Math.PI)*.35;agentPts.write('position',n,p.x,p.y,p.z);agentPts.write('aCol',n,c.r*1.6,c.g*1.6,c.b*1.6,alpha*Math.sin(f*Math.PI)*.9);agentPts.write('aSize',n,.9);n++;}}
    }
    for(const id of agentState.keys())if(!seen.has(id))agentState.delete(id);
    agentPts.commit(n);
  }
  // ---- Effects ----------------------------------------------------------------------------------------------------
  function ring(pos,tilt,maxR,color,duration,thick=1,alpha=1){const k=ringNext++%RINGS;rings.write('rC',k,pos.x,pos.y,pos.z,info.tsec);rings.write('rP',k,duration,maxR,thick,alpha);rings.write('rTilt',k,tilt[0],tilt[1]);rings.write('rColor',k,color.r,color.g,color.b);rings.flush();}
  function burst(pos,color,{radius=2,duration=1.6,size=1,inward=false}={}){const k=burstNext++%BURSTS;burstU.uBA.value[k].set(pos.x,pos.y,pos.z,info.tsec);burstU.uBB.value[k].set(color.r*1.6,color.g*1.6,color.b*1.6,size);burstU.uBC.value[k].set(duration,inward?1:0,radius,0);}
  function flare(a,b,color,{lift=3,width=6,duration=4,intensity=1.6}={}){const k=flareNext++%FLARES;flares.write('fP0',k,a.x,a.y,a.z,info.tsec);flares.write('fP1',k,b.x,b.y,b.z,duration);flares.write('fInfo',k,lift,width,intensity,0);flares.write('fColor',k,color.r,color.g,color.b);flares.flush();}
  function wave(pos,strength,duration=2.4){waves.push({pos:pos.clone(),at:info.tsec,duration,strength});if(waves.length>4)waves.shift();}
  function flash(amount){flashes.push({at:info.tsec,amount});if(flashes.length>6)flashes.shift();}
  const starFlares=new Map();
  function starOf(groupId){return sys.get(groupId)||null;}
  function planetsOf(ids){return (ids||[]).map(id=>({b:bodies.get(id),m:model.modules.get(id)})).filter(x=>x.b&&x.m);}
  function centroid(list){const c=new THREE.Vector3();for(const x of list)c.add(x);return list.length?c.multiplyScalar(1/list.length):c;}
  let info={tsec:0,tview:0};
  function effect(cmd,i){
    if(i)info=i;const tv=info.tview,s=cmd.scale,subj=cmd.subject;const scaleK=clamp(s,0,1.6);
    const planetPos=id=>{const b=bodies.get(id);return b?bodyPos(new THREE.Vector3(),b,tv):null;};
    switch(cmd.effect){
      case 'ignition':{const st=starOf(subj.groupId);if(!st)break;starFlares.set(st.index,info.tsec);ring(st.pos,st.tilt,st.sysR*2.2*scaleK+2,st.color,3.2,1.2,1);burst(st.pos,st.color,{radius:st.sysR*1.2,duration:2.2,size:1.6});wave(st.pos,.5*scaleK);break;}
      case 'planet-birth':{const p=planetPos(subj.fileId);if(!p)break;const b=bodies.get(subj.fileId);burst(p,b.color,{radius:1.4,duration:1.4,size:.9});break;}
      case 'accretion-spark':{const p=planetPos(subj.fileId);if(!p)break;burst(p,pal.highlight,{radius:1.6*scaleK+.5,duration:1.3,size:.7,inward:true});break;}
      case 'ablation':{const p=planetPos(subj.fileId);if(!p)break;burst(p,new THREE.Color(.6,.6,.7),{radius:1.8,duration:1.6,size:.7});break;}
      case 'flare-bridge':{const a=bodies.get(subj.fileId),b=bodies.get(subj.targetId);if(!a||!b)break;const sa=[...sys.values()].find(x=>x.index===a.sysIndex),sb=[...sys.values()].find(x=>x.index===b.sysIndex);if(!sa||!sb)break;
        const big=cmd.tier>=2;flare(sa.pos,sb.pos,sa.color.clone().lerp(sb.color,.5),{lift:2+sa.pos.distanceTo(sb.pos)*.35,width:big?9*scaleK:4,duration:big?5.5:3,intensity:big?2.2:1.2});
        if(big){starFlares.set(sa.index,info.tsec);starFlares.set(sb.index,info.tsec);ring(sa.pos,sa.tilt,sa.sysR*1.6,sa.color,2.6);ring(sb.pos,sb.tilt,sb.sysR*1.6,sb.color,2.6);wave(centroid([sa.pos,sb.pos]),.45*scaleK);}
        break;}
      case 'stellar-storm':{const list=planetsOf(subj.fileIds);for(const x of list.slice(0,10))burst(bodyPos(new THREE.Vector3(),x.b,tv),pal.warning,{radius:1.8,duration:2.4,size:1});
        const groups=new Set(list.map(x=>x.m.group));for(const g of groups){const st=starOf(g);if(st){ring(st.pos,st.tilt,st.sysR*1.8,pal.warning,3.4,1.4,.9);}}flash(.12*scaleK);break;}
      case 'aurora':{const list=planetsOf(subj.fileIds);for(const x of list.slice(0,12))burst(bodyPos(new THREE.Vector3(),x.b,tv),pal.valid,{radius:1.2,duration:2,size:.8});
        const groups=new Set(list.map(x=>x.m.group));for(const g of groups){const st=starOf(g);if(st)ring(st.pos,st.tilt,st.sysR*1.5,pal.valid,3,1,.7);}break;}
      case 'calm-pulse':{const list=planetsOf(subj.fileIds);const groups=new Set(list.map(x=>x.m.group));
        for(const g of groups){const st=starOf(g);if(!st)continue;ring(st.pos,st.tilt,st.sysR*3*scaleK,pal.valid,5,1.6,1.2);burst(st.pos,pal.valid,{radius:st.sysR*1.4,duration:2.6,size:1.3});starFlares.set(st.index,info.tsec);}
        for(const x of list.slice(0,14))burst(bodyPos(new THREE.Vector3(),x.b,tv),pal.valid,{radius:1.4,duration:2.2,size:.9});
        wave(centroid([...groups].map(g=>starOf(g)?.pos).filter(Boolean)),.6*scaleK);flash(.25*scaleK);break;}
      case 'accretion-collapse':{for(const x of planetsOf(subj.fileIds).slice(0,12))burst(bodyPos(new THREE.Vector3(),x.b,tv),pal.highlight,{radius:2.4,duration:2.4,size:1,inward:true});flash(.15);break;}
      case 'nova':{const list=planetsOf(subj.fileIds);const groups=[...new Set(list.map(x=>x.m.group))];const stars=groups.map(starOf).filter(Boolean);const where=stars.length?centroid(stars.map(x=>x.pos)):new THREE.Vector3();
        for(const st of stars){starFlares.set(st.index,info.tsec);burst(st.pos,st.color.clone().lerp(new THREE.Color(1,1,1),.4),{radius:st.sysR*2.4,duration:3.4,size:2});ring(st.pos,st.tilt,st.sysR*3.2,new THREE.Color(1,.95,.85),4.5,2,1.3);}
        ring(where,[0,0],extent*(cmd.tier>=4?2.6:1.5)*scaleK,pal.highlight,cmd.tier>=4?9:6.5,cmd.tier>=4?3:2,1.4);wave(where,(cmd.tier>=4?1.2:.85)*scaleK,cmd.tier>=4?4:3);flash((cmd.tier>=4?1.1:.6)*scaleK);
        if(stars.length>1)for(let k=1;k<stars.length;k++)flare(stars[0].pos,stars[k].pos,pal.highlight,{lift:3,width:10,duration:6,intensity:2.6});break;}
      case 'gravity-wave':{const o=new THREE.Vector3();ring(o,[0,0],extent*1.9*scaleK,pal.highlight.clone().lerp(pal.primary,.3),5,.8,.8);wave(o,.55*scaleK,3.2);dustMat.uniforms.uWave.value.set(0,0,info.tview,1.2*scaleK);break;}
      case 'expansion':{const o=new THREE.Vector3();ring(o,[0,0],extent*2.2,pal.accent,7,1.2,.8);wave(o,.35,3.5);break;}
      default:break;
    }
  }
  // ---- Frame ------------------------------------------------------------------------------------------------------
  function update(i){
    info=i;const epoch=model.epoch,first=builtVersion===-1;
    common.uT.value=i.tsec;common.uV.value=i.tview;common.uSpeed.value=ctx.speed();common.uBeat.value=i.beat*G.music.beatPulse;common.uActivity.value=i.activity;
    common.uIntensity.value=i.overrides.intensity??1;common.uMotion.value=i.overrides.motion??1;
    const px=ctx.renderer.getPixelRatio()*(ctx.pipeline.size[1]/Math.max(1,ctx.renderer.getPixelRatio())/1080);common.uPx.value=Math.max(.5,px);common.uRes.value.set(ctx.pipeline.size[0],ctx.pipeline.size[1]);
    updateLayout(i.t,i.dt,first);
    if(model.version!==builtVersion)syncBodies(i.t);
    // Stars: birth, flares, unrest from stressed planets (state at this moment).
    const list=[...sys.values()].filter(s=>s.d&&Number.isFinite(s.born)?s.born<=i.t:true);stars.ensure(list.length);
    const stress=new Map();for(const id of moduleIds){const m=model.modules.get(id);if(m&&model.alive(m,i.t)&&model.stateAt(m,i.t)==='stressed')stress.set(m.group,(stress.get(m.group)||0)+1);}
    list.forEach((s,k)=>{stars.write('iStar',k,s.index,Number.isFinite(s.born)?secs(s.born,epoch):-1e5,starFlares.has(s.index)?starFlares.get(s.index):-1e5,Math.min(1,(stress.get(s.d.id)||0)/3));stars.write('iStarColor',k,s.color.r,s.color.g,s.color.b);});
    stars.commit(list.length);coronaGeo.instanceCount=list.length;
    // Planets: state transitions (blended in the shader), agent highlight.
    const working=new Map();for(const a of i.agents)if(a.fileId&&a.display==='tool')working.set(a.fileId,a);
    moduleIds.forEach((id,k)=>{const m=model.modules.get(id),b=bodies.get(id);if(!m||!b)return;
      let cur=m.initial,prev=m.initial,at=-1e5;for(const e of m.states){if(e.at>i.t)break;prev=cur;cur=e.state;at=secs(e.at,epoch);}
      planets.write('iLook',k,b.style,STATE_INDEX[cur]??1,STATE_INDEX[prev]??1,b.routes);
      const life=planets.arrays.iLife;life[k*4+2]=at;planets.dirty('iLife');
      const glow=working.has(id)?.9:Number.isFinite(m.lastHuman)&&i.t-m.lastHuman<4000?.5*(1-(i.t-m.lastHuman)/4000):0;
      planets.write('iGlow',k,glow,b.seed);});
    planets.flush();
    updateAgents(i);
    nebula.uniforms.uUnlock.value.set(i.unlocks[0]?.level||0,i.unlocks[1]?.level||0,i.unlocks[2]?.level||0,i.unlocks[3]?.level||0);
    linkMat.uniforms.uFlow.value=G.motion.turbulence*(1+(i.unlocks[1]?.level||0));
  }
  function afterCamera(){nebula.uniforms.uInv.value.copy(camera.projectionMatrixInverse).premultiply(camera.matrixWorld);nebula.uniforms.uCam.value.copy(camera.position);}
  function background(){return nebula;}
  function grade(i){
    const L=G.light,inten=i.overrides.intensity??1;
    const out=[];for(const w of waves){const age=(i.tsec-w.at)/ctx.speed()/w.duration;if(age<0||age>1)continue;const p=w.pos.clone().project(camera);if(p.z>1)continue;out.push({x:p.x*.5+.5,y:p.y*.5+.5,r:age*.9,a:w.strength*(1-age)*inten});}
    let f=0;for(const x of flashes){const age=(i.tsec-x.at)/ctx.speed();if(age>=0&&age<3)f+=x.amount*Math.exp(-age*2.2);}
    return {bloom:L.bloom*(1+.25*i.activity)*(1+(i.unlocks[3]?.level||0)*.1),threshold:L.bloomThreshold,exposure:L.exposure*(i.mood.section==='breath'?.9:1),contrast:L.contrast,saturation:1.08,vignette:L.vignette,grain:L.grain,flash:f*inten,waves:out,
      tint:i.mood.section==='tension'?new THREE.Vector3(1.06,.96,.92):i.mood.section==='resolve'?new THREE.Vector3(.95,1.04,1):new THREE.Vector3(1,1,1)};
  }
  // ---- Camera: establishing orbit, attention on what changed, a slow tour of the systems when the work is quiet ----
  function cameraGoal(i){
    const C=G.camera,fov=C.fov,aspect=camera.aspect||16/9,tanHalf=Math.tan(THREE.MathUtils.degToRad(fov)/2);
    const live=[...sys.values()].filter(s=>s.pos&&(!Number.isFinite(s.born)||s.born<=i.t));
    const centre=live.length?centroid(live.map(s=>s.pos)).multiplyScalar(.35):new THREE.Vector3();let spread=0;for(const s of live)spread=Math.max(spread,s.pos.distanceTo(centre)+s.sysR);
    spread=Math.max(spread,4,(discR||10)*.62);
    // Establishing: the galaxy fills the frame; its luminous disc carries the edges.
    const fit=spread/tanHalf/Math.min(aspect,1.8)*.95*C.distance;
    const baseAz=-.6+rand(seed)*6.283;
    let az=C.personality==='orbital'?baseAz+i.tview*Math.PI*2/520*(i.overrides.motion??1):baseAz+Math.sin(i.tview/95)*.75;
    let el=C.elevation+.06*Math.sin(i.tview/71);let target=centre.clone(),distance=Math.max(8,fit);
    const att=ctx.director.attentionAt(i.t,2);const since=att?(i.t-att.at)/ctx.speed()/1000:Infinity;
    // Attention: frame what changed at the size of what changed (a system, a planet with its orbit, a group), then ease back.
    if(since<14&&att){const a=attentionSubject(att,i);if(a){const k=smooth(1-Math.max(0,since-9)/5);target.lerp(a.pos,.75*k);distance=lerp(distance,Math.min(distance,Math.max(7,a.radius/tanHalf*1.25)),k);}}
    else{
      const busy=i.agents.find(a=>a.display==='tool'&&a.fileId&&bodies.has(a.fileId));
      if(busy){const b=bodies.get(busy.fileId);target.lerp(bodyPos(tmp,b,i.tview),.35);distance=lerp(distance,Math.max(7,(b.r+2)/tanHalf*1.3),.35);}
      else if(i.phase==='idle'&&live.length>1){const list=live.slice().sort((a,b)=>a.index-b.index);const stop=Math.floor(i.tview/26)%list.length;target.lerp(list[stop].pos,.5);distance=lerp(distance,Math.max(8,list[stop].sysR*1.6/tanHalf),.45);az+=Math.sin(i.tview/40)*.25;}
    }
    return {target,distance,azimuth:az,elevation:el,fov,omega:.7};
  }
  function attentionSubject(c,i){const s=c.subject||{};
    if(s.fileId&&bodies.has(s.fileId)){const b=bodies.get(s.fileId);const st=[...sys.values()].find(x=>x.index===b.sysIndex);
      if(s.targetId&&bodies.has(s.targetId)){const p=bodyPos(new THREE.Vector3(),b,i.tview),q=bodyPos(new THREE.Vector3(),bodies.get(s.targetId),i.tview);return {pos:p.clone().lerp(q,.5),radius:p.distanceTo(q)*.6+2};}
      return {pos:st?st.pos.clone().lerp(bodyPos(new THREE.Vector3(),b,i.tview),.5):bodyPos(new THREE.Vector3(),b,i.tview),radius:(st?st.sysR:b.r+1)*1.05};}
    if(s.groupId&&sys.get(s.groupId)?.pos){const st=sys.get(s.groupId);return {pos:st.pos.clone(),radius:st.sysR*1.1};}
    const list=planetsOf(s.fileIds);if(list.length){const pts=list.map(x=>bodyPos(new THREE.Vector3(),x.b,i.tview));const c0=centroid(pts);let r=3;for(const p of pts)r=Math.max(r,p.distanceTo(c0)+2);return {pos:c0,radius:r};}
    return null;}
  function attentionPoint(c,i){const s=c.subject||{};
    if(s.fileId&&bodies.has(s.fileId)){if(s.targetId&&bodies.has(s.targetId))return bodyPos(new THREE.Vector3(),bodies.get(s.fileId),i.tview).lerp(bodyPos(new THREE.Vector3(),bodies.get(s.targetId),i.tview),.5);return bodyPos(new THREE.Vector3(),bodies.get(s.fileId),i.tview);}
    if(s.groupId&&sys.get(s.groupId)?.pos)return sys.get(s.groupId).pos.clone();
    const list=planetsOf(s.fileIds);if(list.length)return centroid(list.map(x=>bodyPos(new THREE.Vector3(),x.b,i.tview)));return new THREE.Vector3();}
  // ---- Words -------------------------------------------------------------------------------------------------------
  const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
  const groupName=id=>{const s=sys.get(id);return s?`${ctx.name(id)} · ${s.role}`:ctx.name(id);};
  const MILESTONE={'first-validation':'First validation','integration-validated':'Integration validated','recovery':'Recovery','refactor':'Refactor validated'};
  function describe(c,i){const s=c.subject||{},d=c.detail||{},n=(s.fileIds||[]).length;const pos=attentionPoint(c,i);
    switch(c.intent){
      case 'subsystem.created':return {text:'A new star ignites',sub:groupName(s.groupId),position:pos};
      case 'structure.created':return {text:'New structure enters orbit',sub:Object.entries(d.kinds||{}).filter(([k])=>k!=='variable').map(([k,v])=>`${v} ${k.replace('ui.component','component').replace('api.route','route')}`).join(' · ')||plural(d.count||1,'symbol'),position:pos};
      case 'subsystem.connected':{const a=bodies.get(s.fileId),b=bodies.get(s.targetId);const ga=a?model.modules.get(s.fileId)?.group:null,gb=b?model.modules.get(s.targetId)?.group:null;
        return {text:d.first?'Integration · two systems connect':'A route between systems strengthens',sub:ga&&gb?`${ctx.name(ga)} ↔ ${ctx.name(gb)}`:'',position:pos};}
      case 'validation.failed':return {text:`Tests fail · storms on ${plural(n,'world')}`,sub:'observed failing run',position:pos,color:'#ff8a6a'};
      case 'validation.passed':return {text:`Tests pass · ${plural(n,'world')} validated`,sub:'observed passing run',position:pos,color:'#9dffcf'};
      case 'validation.recovered':return {text:`Recovered · ${plural(d.repaired||n,'world')} repaired`,sub:'the tests pass again',position:pos,color:'#9dffcf',banner:'Recovery',bannerSub:'the tests pass again'};
      case 'refactor.validated':return {text:'Refactor validated · the system consolidates',sub:plural(d.removedSymbols||0,'symbol')+' removed',position:pos,banner:'Refactor validated',bannerSub:'verified by a passing test run'};
      case 'milestone.achieved':{const k=(d.kinds||[]).map(x=>MILESTONE[x]||x);return {text:`Nova · ${k.join(' + ')}`,sub:'verified by a passing test run',position:pos,banner:k.join(' · '),bannerSub:'milestone · verified by a passing test run'};}
      case 'repository.checkpoint':return {text:`Committed · ${plural(n,'world')} set in orbit`,sub:'commit observed',position:pos};
      case 'world.expanded':return {text:`The forge grows · chapter ${d.chapter}`,sub:'accumulated structure',position:new THREE.Vector3()};
      default:return null;}}
  function agentPosition(id){return agentState.get(id)?.pos||null;}
  function agentColor(a){return '#'+AGENT_COLORS[a.voice%8].getHexString();}
  function subsystemLabels(i){return [...sys.values()].filter(s=>s.pos&&Number.isFinite(s.born)?s.born<=i.t:!!s.pos).map(s=>({position:s.pos.clone().add(new THREE.Vector3(0,s.radius*1.4+.6,0)),text:ctx.name(s.d.id),sub:`${s.role} · ${plural(s.d.members.length,'module')}`}));}
  function status(i){let v=0,st=0;for(const id of moduleIds){const m=model.modules.get(id);if(!m||!model.alive(m,i.t))continue;const s=model.stateAt(m,i.t);if(s==='validated')v++;if(s==='stressed')st++;}return st?`${st} under strain`:v?`${v} validated`:'';}
  function pick(x,y,cam,i){let best=null,bd=.05;for(const [id,b] of bodies){const p=bodyPos(tmp,b,i.tview).project(cam);const d=Math.hypot(p.x-x,(p.y-y)*.6);if(p.z<1&&d<bd){bd=d;best=id;}}
    if(!best)for(const s of sys.values()){if(!s.pos)continue;const p=s.pos.clone().project(cam);const d=Math.hypot(p.x-x,p.y-y);if(p.z<1&&d<bd*1.6){bd=d;best='sys:'+s.d.id;}}return best;}
  function inspect(id,i){if(!id)return null;
    if(id.startsWith('sys:')){const s=sys.get(id.slice(4));return s?{position:s.pos.clone(),text:groupName(s.d.id),sub:`${plural(s.d.members.length,'module')} · star of this subsystem`}:null;}
    const m=model.modules.get(id),b=bodies.get(id);if(!m||!b)return null;const syms=model.symbolsAt(m,i.t);const deps=[...model.links.values()].filter(l=>(l.a===id||l.b===id)&&model.alive(l,i.t)).length;
    return {position:bodyPos(new THREE.Vector3(),b,i.tview),text:`A ${['UI','typed','test','logic','configuration'][b.style]} world · ${model.stateAt(m,i.t)}`,sub:`${plural(syms,'symbol')} · ${plural(deps,'dependency')} · ${ctx.name(m.group)}`};}
  function stats(){return {systems:sys.size,planets:moduleIds.length,moons:symbolIds.length,links:linkKeys.length,dust:dustCount,galaxy:+(ringR||0).toFixed(2),arrangement:ARR,
    camera:camera.position.toArray().map(x=>+x.toFixed(1)),stars:[...sys.values()].filter(x=>x.pos).map(x=>[x.index,x.role,...x.pos.toArray().map(v=>+v.toFixed(1)),+x.sysR.toFixed(1)])};}
  function dispose(){for(const o of [starMesh,coronaMesh,planetMesh,jetMesh,moonPoints,linkMesh,dustPoints,gasPoints,skyPoints,coreGlow,agentPoints,ringMesh,burstPoints,flareMesh]){scene.remove(o);o.geometry.dispose();o.material.dispose();}nebula.dispose();starBase.dispose();ribbon.dispose();quad.dispose();}
  return {rebuild,update,afterCamera,background,grade,cameraGoal,effect,describe,agentPosition,agentColor,subsystemLabels,status,pick,inspect,stats,dispose};
}

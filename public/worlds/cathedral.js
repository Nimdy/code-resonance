// Machine Cathedral: the software as engineered architecture, built while the work happens (the Construct's visual
// language, rebuilt for the living-world engine: instanced, atmospheric, alive between events).
//
// Data -> image (unchanged meaning from the Construct):
//  - district (subsystem) -> a luminous plot on the survey ground, coloured by what it contains
//  - file (module)        -> a tower on its persisted plot; storeys are its symbols in stable slot order
//                            (functions floors, classes thick blocks, components glass, interfaces/types open frames,
//                            constants thin plates; API routes are roof spires; overflow forms a crown)
//  - material state       -> draft: scaffold edges; committed: solid with faint windows; validated: lit windows;
//                            stressed: red strain lines, only where a failing run applies
//  - dependency           -> a conduit near the ground; across districts a bridge between rooftops
//  - agent                -> a drone: hovering over the tower it reads or edits while a tool runs, beaming light;
//                            circling its district while working on a request; resting at the edge while waiting
// Ambient life (never progress): drifting fog and motes, breathing window light, energy flowing in conduits, slow
// mechanisms turning around tall towers. Verified milestones unlock searchlights, beacons and glass aurora.
import {THREE,NOISE,BACKGROUND_VS,clamp,lerp,smooth,hash,rand,rng,instancedBuffers,pointBuffers} from './core.js';
const STATE_INDEX={draft:0,committed:1,validated:2,stressed:3};
const SQRT3=Math.sqrt(3);
const KINDS={function:{h:.3,r:.56,look:0},method:{h:.21,r:.54,look:0},class:{h:.44,r:.64,look:1},'ui.component':{h:.38,r:.6,look:2},interface:{h:.22,r:.56,look:3},type:{h:.16,r:.54,look:3},variable:{h:.1,r:.5,look:4}};
const PALETTE=['#43d1c1','#f2a65a','#a78bfa','#f582ae','#5cb7f2','#9be37d','#f7786b','#e9d461'];
const secs=(t,epoch)=>Number.isFinite(t)?(t-epoch)/1000:(t>0?1e6:-1e5);
const FOG=`uniform vec3 uFog;uniform float uFogD;vec3 fog(vec3 c,float d){return mix(c,uFog,1.-exp(-d*uFogD));}float fogK(float d){return exp(-d*uFogD);}`;
export function createFamily(ctx){
  const {scene,camera,model,recipe}=ctx;const G=recipe.genome,P=G.palette,arch=G.geometry.architecture;
  const col=c=>new THREE.Color(c);
  const pal={primary:col(P.primary),secondary:col(P.secondary),accent:col(P.accent),highlight:col(P.highlight),deep:col(P.deep),haze:col(P.haze),warning:col(P.warning),valid:col(P.valid)};
  const seed=recipe.projectSeed>>>0;
  const fogColor=pal.deep.clone().lerp(pal.haze,G.atmosphere.weather==='steam'?.45:.3).multiplyScalar(1.1);
  const common={uT:{value:0},uV:{value:0},uSpeed:{value:1},uPx:{value:1},uRes:{value:new THREE.Vector2(1920,1080)},uBeat:{value:0},uActivity:{value:0},
    uFog:{value:fogColor},uFogD:{value:.008+.012*G.atmosphere.fog},uUnlock:{value:new THREE.Vector4()},uKey:{value:new THREE.Vector3(-.45,.8,.35).normalize()},
    uWaves:{value:Array.from({length:4},()=>new THREE.Vector4(0,0,0,-1e5))},uWaveC:{value:Array.from({length:4},()=>new THREE.Vector4(0,0,0,1))}};
  const WAVE=`uniform vec4 uWaves[4],uWaveC[4];uniform float uT,uSpeed;
    vec3 waves(vec3 p){vec3 a=vec3(0.);for(int i=0;i<4;i++){float age=(uT-uWaves[i].w)/uSpeed;if(age<0.||age>7.)continue;float r=age*uWaveC[i].w;float d=distance(p.xz,uWaves[i].xz);
      a+=uWaveC[i].rgb*exp(-pow((d-r)*1.1,2.))*(1.-age/7.);}return a;}`;
  const S=1.0*G.space.spread;
  const plot=(q,r)=>new THREE.Vector3((SQRT3*q+SQRT3/2*r)*S,0,1.5*r*S);
  // ---- Ground: dark stone, the survey grid, district plots glowing under their towers -------------------------
  const DMAX=32;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShaderMaterial({uniforms:{...common,uScale:{value:80},uPlots:{value:Array.from({length:DMAX},()=>new THREE.Vector4())},uPlotC:{value:Array.from({length:DMAX},()=>new THREE.Vector4())},
      uGrid:{value:pal.highlight.clone().lerp(pal.primary,.4)},uStone:{value:pal.deep.clone().lerp(new THREE.Color('#1a2230'),.6)}},
    vertexShader:`uniform float uScale;varying vec3 vW;void main(){vec3 p=vec3(position.x*uScale,0.,-position.y*uScale);vW=p;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,
    fragmentShader:`${NOISE}${FOG}${WAVE}uniform float uV,uActivity;uniform vec3 uGrid,uStone;uniform vec4 uPlots[${DMAX}],uPlotC[${DMAX}];varying vec3 vW;
      float hexEdge(vec2 p){vec2 q=vec2(p.x/1.7320508,p.y/1.5+p.x/3.4641016);vec2 g=floor(q);vec2 f=fract(q);
        vec3 c=vec3(f,1.-f.x-f.y);float e=min(min(abs(f.x-f.y),abs(fract(q.x+q.y)-.5)),1.);
        vec2 r=vec2(p.x,p.y);vec2 h=vec2(1.7320508,1.5);vec2 a=mod(r,vec2(h.x,h.y*2.))-vec2(h.x,h.y*2.)*.5,b=mod(r-vec2(h.x*.5,h.y),vec2(h.x,h.y*2.))-vec2(h.x,h.y*2.)*.5;
        vec2 gv=dot(a,a)<dot(b,b)?a:b;vec2 ab=abs(gv);float d=max(dot(ab,normalize(vec2(1.,1.7320508))),ab.x);return 1.-smoothstep(.0,.04,abs(d-.84));}
      void main(){vec2 p=vW.xz;float n=fbm3(vec3(p*.15,1.));vec3 c=uStone*(.55+.3*n)+vec3(.006);
        float grid=hexEdge(p/${S.toFixed(3)})*.5;float plot=0.;vec3 pc=vec3(0.);
        for(int i=0;i<${DMAX};i++){if(uPlots[i].w<=0.)continue;float d=distance(p,uPlots[i].xz);float k=exp(-pow(d/uPlots[i].w,2.)*1.6)*uPlotC[i].w;plot+=k;pc+=uPlotC[i].rgb*k;}
        c+=pc*.16*(.9+.1*sin(uV*.6+n*6.))+uGrid*grid*(.025+.11*min(1.,plot))+waves(vW)*.8;
        float dist=length(cameraPosition-vW);gl_FragColor=vec4(fog(c,dist),1.);}`}));
  ground.frustumCulled=false;ground.renderOrder=-2;scene.add(ground);
  // ---- Storeys, plinths, crowns, spires (instanced; procedural windows, scaffold and strain in the shader) -----
  const sides=arch==='brutalist'?4:6;
  const prism=new THREE.CylinderGeometry(1,1,1,sides,1,false);prism.translate(0,.5,0);if(sides===4)prism.rotateY(Math.PI/4);
  const blocks=instancedBuffers(prism,{bPos:4,bSize:4,bLife:4,bState:4,bColor:3},256);
  const blockMat=new THREE.ShaderMaterial({uniforms:{...common,uValid:{value:pal.valid.clone().lerp(new THREE.Color('#fff0d2'),.5)},uStress:{value:pal.warning},uScaffold:{value:new THREE.Color('#d7ecff')},uWin:{value:G.secondary.windows},uGlass:{value:G.material.glass}},
    vertexShader:`${WAVE}attribute vec4 bPos,bSize,bLife,bState;attribute vec3 bColor;uniform float uV;varying vec3 vW,vN,vC,vL,vWave;varying vec4 vS,vZ,vLf;varying float vH;
      void main(){float age=(uT-bLife.x)/uSpeed;float gone=bLife.y<1e5?clamp((uT-bLife.y)/uSpeed/.9,0.,1.):0.;
        float rise=clamp(age/.45,0.,1.);float settle=clamp((uT-bLife.z)/uSpeed/.6,0.,1.);float y=mix(bPos.w,bPos.y,settle*settle*(3.-2.*settle));
        vec3 local=position;float r=bSize.x*(1.-gone*.6),h=bSize.y*(rise<1.?(rise*rise*(3.-2.*rise))*.999+.001:1.);
        vec3 w=vec3(bPos.x,y,bPos.z)+vec3(local.x*r,local.y*h,local.z*r);
        vW=w;vN=normalize(normal);vL=position;vC=bColor;vS=bState;vZ=bSize;vLf=vec4(age,gone,bLife.w,0.);vH=h;vWave=waves(w);
        gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`${NOISE}${FOG}uniform vec3 uValid,uStress,uScaffold,uKey;uniform float uV,uWin,uGlass,uBeat,uT,uSpeed;uniform vec4 uUnlock;varying vec3 vW,vN,vC,vL,vWave;varying vec4 vS,vZ,vLf;varying float vH;
      void main(){if(vLf.y>=1.)discard;vec3 n=normalize(vN);vec3 v=normalize(cameraPosition-vW);float look=vZ.z;
        float k=clamp((uT-vS.z)/uSpeed/1.2,0.,1.);float st=k>.5?vS.x:vS.y;
        float edgeX=min(abs(fract(atan(vL.z,vL.x)/6.2832*${sides}.+.5)-.5)*2.,1.);float edgeY=min(vL.y,1.-vL.y);float edge=1.-smoothstep(.0,.06,min(edgeX*.5,edgeY*vZ.y*2.));
        float diff=max(0.,dot(n,uKey))*.75+.12;float rim=pow(1.-abs(dot(n,v)),3.);
        vec3 body=look>1.5&&look<2.5?mix(vec3(.55,.75,.95),vC,.45)*(.25+uGlass*.2):look>3.5?vec3(.35,.4,.48)+vC*.1:vec3(.62,.66,.74)*.55+vC*(look>.5&&look<1.5?.32:.18);
        vec3 c=body*diff*.55+vC*rim*.25;
        // Window bands: rows on the walls; lit by validation, faint when committed, red under strain.
        float rows=step(.35,fract(vL.y*max(1.,vZ.y*7.)))*step(.2,abs(fract(atan(vL.z,vL.x)/6.2832*${sides*3}.)-.5)*2.)*step(.05,abs(n.y-1.)*abs(n.y+1.));
        float flick=.85+.15*sin(uV*(1.3+vZ.w*5.)+vZ.w*40.)+.05*uBeat;
        if(st>1.5&&st<2.5)c+=uValid*rows*1.4*uWin*flick;else if(st>2.5)c+=uStress*(rows*1.1+edge*1.6)*(.7+.3*sin(uV*6.+vW.y*4.));else if(st>.5)c+=mix(uValid,vC,.5)*rows*.22*uWin*flick;
        if(st<.5){c=c*.35+uScaffold*edge*1.2+vC*.05;}
        if(look>2.5&&look<3.5){c=c*.5+vC*edge*.9;}
        c+=vC*edge*.08+vWave*.9+uUnlock.w*vec3(.4,.9,.8)*rows*rim*.6;
        float birth=vLf.x>0.&&vLf.x<1.2?1.-vLf.x/1.2:0.;c+=uScaffold*birth*edge*2.;
        gl_FragColor=vec4(fog(c,length(cameraPosition-vW)),1.);}`});
  const blockMesh=new THREE.Mesh(blocks.geometry,blockMat);blockMesh.frustumCulled=false;scene.add(blockMesh);
  const spireGeo=new THREE.ConeGeometry(.06,1,5,1,false);spireGeo.translate(0,.5,0);
  const spires=instancedBuffers(spireGeo,{pPos:4,pLife:4,pColor:3},32);
  const spireMat=new THREE.ShaderMaterial({uniforms:common,
    vertexShader:`attribute vec4 pPos,pLife;attribute vec3 pColor;uniform float uT,uSpeed,uV;varying vec3 vC;varying float vY,vA;varying vec3 vW;
      void main(){float age=(uT-pLife.x)/uSpeed;float g=clamp(age/.9,0.,1.);float gone=pLife.y<1e5?clamp((uT-pLife.y)/uSpeed/.9,0.,1.):0.;
        vec3 w=vec3(pPos.x,pPos.y,pPos.z)+vec3(position.x,position.y*pPos.w*g*(1.-gone),position.z);vW=w;vC=pColor;vY=position.y;vA=g*(1.-gone);gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`${FOG}uniform float uV,uBeat;varying vec3 vC;varying float vY,vA;varying vec3 vW;void main(){vec3 c=vC*(.25+smoothstep(.85,1.,vY)*3.*(.7+.3*sin(uV*2.+vW.x)+.3*uBeat));gl_FragColor=vec4(fog(c*vA,length(cameraPosition-vW)),1.);}`});
  const spireMesh=new THREE.Mesh(spires.geometry,spireMat);spireMesh.frustumCulled=false;scene.add(spireMesh);
  // ---- Conduits and bridges (screen-space ribbons, double-sided) ------------------------------------------------
  const SEG=24;const ribbon=(()=>{const g=new THREE.BufferGeometry(),t=[],side=[],idx=[];
    for(let i=0;i<=SEG;i++){t.push(i/SEG,i/SEG);side.push(-1,1);if(i<SEG){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}}
    g.setAttribute('position',new THREE.Float32BufferAttribute(new Array((SEG+1)*2*3).fill(0),3));g.setAttribute('aT',new THREE.Float32BufferAttribute(t,1));g.setAttribute('aSide',new THREE.Float32BufferAttribute(side,1));g.setIndex(idx);return g;})();
  const links=instancedBuffers(ribbon,{kA:4,kB:4,kInfo:4,kColA:3,kColB:3},128);
  const linkMat=new THREE.ShaderMaterial({uniforms:common,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:`attribute float aT,aSide;attribute vec4 kA,kB,kInfo;attribute vec3 kColA,kColB;uniform float uT,uSpeed,uPx,uV;uniform vec2 uRes;varying float vT,vSide,vAl,vCross,vSeed,vD;varying vec3 vC;
      vec3 curve(vec3 a,vec3 b,float lift,float t){vec3 m=(a+b)*.5+vec3(0.,lift,0.);float u=1.-t;return u*u*a+2.*u*t*m+t*t*b;}
      void main(){vec3 a=kA.xyz,b=kB.xyz;float d=distance(a,b);float lift=kInfo.z>.5?(1.1+.24*d):(.25+.08*d);
        vec3 p=curve(a,b,lift,aT),q=curve(a,b,lift,min(1.,aT+.01));if(aT>.99)q=p+(p-curve(a,b,lift,aT-.01));
        vec4 cp=projectionMatrix*viewMatrix*vec4(p,1.),cq=projectionMatrix*viewMatrix*vec4(q,1.);vec2 dir=normalize((cq.xy/cq.w-cp.xy/cp.w)*uRes+1e-5);vec2 nrm=vec2(-dir.y,dir.x);
        float age=(uT-kInfo.x)/uSpeed;float grow=clamp(age/(kInfo.z>.5?1.8:.9),0.,1.);float gone=kInfo.y<1e5?clamp((uT-kInfo.y)/uSpeed/.9,0.,1.):0.;
        float w=(kInfo.z>.5?3.2:1.5)*uPx*(1.+(1.-smoothstep(0.,3.,age))*1.5);cp.xy+=nrm*aSide*w/uRes*2.*cp.w;gl_Position=cp;
        vT=aT;vSide=aSide;vAl=(aT<=grow?1.:0.)*(1.-gone);vCross=kInfo.z;vSeed=kInfo.w;vC=mix(kColA,kColB,aT);vD=length(cameraPosition-p);}`,
    fragmentShader:`${FOG}uniform float uV,uActivity;varying float vT,vSide,vAl,vCross,vSeed,vD;varying vec3 vC;
      void main(){if(vAl<.01)discard;float edge=1.-vSide*vSide;float p=fract(vT*(vCross>.5?3.:2.)-uV*(.18+.2*uActivity)+vSeed);float pulse=smoothstep(0.,.05,p)*smoothstep(.2,.05,p);
        gl_FragColor=vec4(vC*edge*((vCross>.5?.6:.14)+pulse*(vCross>.5?1.8:.7))*vAl*fogK(vD),1.);}`});
  const linkMesh=new THREE.Mesh(links.geometry,linkMat);linkMesh.frustumCulled=false;linkMesh.renderOrder=1;scene.add(linkMesh);
  // ---- Mechanisms: slow rings turning around the tallest towers (ambient; more with the recipe's mechanism level) -
  const MECH=24,mechs=instancedBuffers(new THREE.TorusGeometry(1,.012,4,64),{mPos:4,mInfo:4,mColor:3},MECH);
  const mechMat=new THREE.ShaderMaterial({uniforms:common,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 mPos,mInfo;attribute vec3 mColor;uniform float uV,uT,uSpeed;varying vec3 vC;varying float vA,vD;
      void main(){float a=uV*mInfo.y+mInfo.z;float tilt=mInfo.w;vec3 p=position*mPos.w;
        float ct=cos(1.5708+tilt),st=sin(1.5708+tilt);p=vec3(p.x,p.y*ct-p.z*st,p.y*st+p.z*ct);float ca=cos(a),sa=sin(a);p=vec3(p.x*ca-p.z*sa,p.y,p.x*sa+p.z*ca);
        vec3 w=mPos.xyz+p+vec3(0.,sin(uV*.3+mInfo.z)*.15,0.);vC=mColor;vA=clamp((uT-mInfo.x)/uSpeed/3.,0.,1.);vD=length(cameraPosition-w);gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`${FOG}uniform float uV;varying vec3 vC;varying float vA,vD;void main(){gl_FragColor=vec4(vC*vA*fogK(vD)*.9,1.);}`});
  const mechMesh=new THREE.Mesh(mechs.geometry,mechMat);mechMesh.frustumCulled=false;scene.add(mechMesh);
  // ---- Motes, searchlights (unlock), drones (agents), bursts ----------------------------------------------------
  const moteCount=Math.round(2000+3500*G.atmosphere.motes),motes=pointBuffers({mInfo:4},moteCount);
  {const r=rng(hash(`motes/${seed}`));for(let i=0;i<moteCount;i++){motes.write('position',i,(r()-.5)*2,r(),(r()-.5)*2);motes.write('mInfo',i,r(),.3+r()*1.4,r()*6.283,r());}motes.commit(moteCount);}
  const moteMat=new THREE.ShaderMaterial({uniforms:{...common,uBox:{value:new THREE.Vector3(40,12,40)},uMote:{value:pal.highlight.clone().lerp(pal.valid,.3)}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`uniform vec3 uBox;uniform float uV,uPx;attribute vec4 mInfo;varying float vA,vD;void main(){float y=fract(position.y+uV*.008*mInfo.y)*uBox.y;
      vec3 p=vec3(position.x*uBox.x+sin(uV*.15*mInfo.y+mInfo.z)*2.,y,position.z*uBox.z+cos(uV*.12*mInfo.y+mInfo.z)*2.);vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;vD=-mv.z;
      gl_PointSize=clamp(1.4*uPx*30./max(1.,-mv.z),1.,5.);vA=(.4+.6*mInfo.w)*smoothstep(0.,1.,y)*(1.-smoothstep(uBox.y*.7,uBox.y,y));}`,
    fragmentShader:`${FOG}uniform vec3 uMote;varying float vA,vD;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(uMote*exp(-r*3.)*vA*.35*fogK(vD*.5),1.);}`});
  const motePoints=new THREE.Points(motes.geometry,moteMat);motePoints.frustumCulled=false;motePoints.renderOrder=3;scene.add(motePoints);
  const LIGHTS=8,lights=instancedBuffers(new THREE.ConeGeometry(1,1,24,1,true).translate(0,-.5,0),{sPos:4,sInfo:4,sColor:3},LIGHTS);
  const lightMat=new THREE.ShaderMaterial({uniforms:common,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:`attribute vec4 sPos,sInfo;attribute vec3 sColor;uniform float uV;uniform vec4 uUnlock;varying vec3 vC;varying float vY,vA;
      void main(){float a=uV*sInfo.y+sInfo.z;vec3 dir=normalize(vec3(cos(a)*.45,1.,sin(a)*.45));vec3 up=vec3(0.,1.,0.);vec3 ax=normalize(cross(up,dir)+1e-4);float ang=acos(dot(up,dir));
        vec3 p=position;p.xz*=sPos.w*.25;p.y*=sPos.w;p.y=-p.y;vec3 k=ax;float c=cos(ang),s=sin(ang);p=p*c+cross(k,p)*s+k*dot(k,p)*(1.-c);
        vec3 w=sPos.xyz+p;vC=sColor;vY=-position.y;vA=uUnlock.x*sInfo.x;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`varying vec3 vC;varying float vY,vA;void main(){gl_FragColor=vec4(vC*(1.-vY)*.06*vA,1.);}`});
  const lightMesh=new THREE.Mesh(lights.geometry,lightMat);lightMesh.frustumCulled=false;lightMesh.renderOrder=4;scene.add(lightMesh);
  const MAX_AGENTS=10,PER_AGENT=40,agentPts=pointBuffers({aCol:4,aSize:1},MAX_AGENTS*PER_AGENT);
  const agentMat=new THREE.ShaderMaterial({uniforms:common,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 aCol;attribute float aSize;uniform float uPx;varying vec4 vC;void main(){vec4 mv=viewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*uPx*40./max(.5,-mv.z),0.,48.);vC=aCol;}`,
    fragmentShader:`varying vec4 vC;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC.rgb*(exp(-r*4.)+exp(-r*20.)*2.)*vC.a,1.);}`});
  const agentPoints=new THREE.Points(agentPts.geometry,agentMat);agentPoints.frustumCulled=false;agentPoints.renderOrder=5;scene.add(agentPoints);
  const BURSTS=24,PER=48,burstPts=pointBuffers({bDir:4},BURSTS*PER);
  {const r=rng(hash(`burst/${seed}`));for(let b=0;b<BURSTS;b++)for(let k=0;k<PER;k++){const u=r()*2-1,a=r()*6.283,s=Math.sqrt(1-u*u);burstPts.write('position',b*PER+k,0,0,0);burstPts.write('bDir',b*PER+k,Math.cos(a)*s,Math.abs(u)*.9+.1,Math.sin(a)*s,b+r()*.9);}burstPts.commit(BURSTS*PER);}
  const burstU={uBA:{value:Array.from({length:BURSTS},()=>new THREE.Vector4(0,0,0,-1e5))},uBB:{value:Array.from({length:BURSTS},()=>new THREE.Vector4())},uBC:{value:Array.from({length:BURSTS},()=>new THREE.Vector4(1,0,1,0))}};
  const burstMat=new THREE.ShaderMaterial({uniforms:{...common,...burstU},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 bDir;uniform vec4 uBA[${BURSTS}],uBB[${BURSTS}],uBC[${BURSTS}];uniform float uT,uSpeed,uPx;varying vec3 vC;varying float vA;
      void main(){int b=int(bDir.w);float sp=fract(bDir.w);vec4 A=uBA[b],B=uBB[b],C=uBC[b];float age=(uT-A.w)/uSpeed/C.x;
        if(age<0.||age>1.){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;vA=0.;return;}
        vec3 dir=bDir.xyz;if(C.y>1.5)dir=vec3(0.,1.,0.)*.8+dir*.25;float travel=(1.-pow(1.-age,2.2))*C.z*(.4+sp);vec3 p=A.xyz+dir*travel;if(C.y<.5)p.y-=age*age*1.2;
        vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(B.w*uPx*24./max(.5,-mv.z)*(1.-age*.5),1.,20.);vC=B.rgb;vA=1.-age;}`,
    fragmentShader:`varying vec3 vC;varying float vA;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vC*exp(-r*4.)*vA*2.,1.);}`});
  const burstPoints=new THREE.Points(burstPts.geometry,burstMat);burstPoints.frustumCulled=false;burstPoints.renderOrder=6;scene.add(burstPoints);let burstNext=0;
  // ---- Sky: dusk or night, heavier near the horizon -----------------------------------------------------------------
  const sky=new THREE.ShaderMaterial({uniforms:{...common,uInv:{value:new THREE.Matrix4()},uCam:{value:new THREE.Vector3()},uTop:{value:pal.deep.clone().multiplyScalar(.6)},uHorizon:{value:fogColor.clone()},
      uGlow:{value:pal.accent.clone().lerp(pal.highlight,.4)},uDusk:{value:G.atmosphere.weather==='dusk-haze'?1:0}},vertexShader:BACKGROUND_VS,depthWrite:false,depthTest:false,
    fragmentShader:`${NOISE}varying vec2 vUv;uniform mat4 uInv;uniform vec3 uCam,uTop,uHorizon,uGlow;uniform float uV,uDusk;uniform vec4 uUnlock;
      void main(){vec4 p=uInv*vec4(vUv*2.-1.,1.,1.);vec3 d=normalize(p.xyz/p.w-uCam);float h=d.y;vec3 c=mix(uHorizon,uTop,smoothstep(-.02,.45,h));
        c+=uGlow*exp(-abs(h-.03)*14.)*(.12+.18*uDusk);float n=fbm3(vec3(d.x*2.5+uV*.004,d.y*6.,d.z*2.5));c*=.88+.25*n;
        float aur=uUnlock.w*smoothstep(.1,.6,fbm3(vec3(d.x*4.,d.y*10.-uV*.05,d.z*4.)))*smoothstep(.1,.45,h);c+=vec3(.3,.9,.7)*aur*.18;
        gl_FragColor=vec4(c,1.);}`});
  // ---- Structure ------------------------------------------------------------------------------------------------
  const districts=new Map(),towers=new Map();let builtVersion=-1,blockCount=0,spireCount=0,linkCount=0,mechCount=0,extent=8,centre=new THREE.Vector3();
  const blockRefs=[];   // per instance: {kind:'storey'|'plinth'|'crown'|'pavilion', module, symbol}
  function districtColor(d){return d.core?new THREE.Color('#efe6cf'):new THREE.Color(PALETTE[(d.order+PALETTE.length*8-1)%PALETTE.length]).lerp(pal.primary,.25);}
  function build(t){
    const epoch=model.epoch;districts.clear();towers.clear();blockRefs.length=0;
    let k=0;centre.set(0,0,0);let n=0;
    for(const d of [...model.districts.values()].filter(d=>d.members.length).sort((a,b)=>a.order-b.order)){
      const members=d.members.map(id=>model.modules.get(id)).filter(Boolean);
      const c=new THREE.Vector3();for(const m of members)c.add(plot(m.q,m.r));c.multiplyScalar(1/members.length);
      let r=1.5;for(const m of members)r=Math.max(r,plot(m.q,m.r).distanceTo(c)+1.4);
      const color=districtColor(d);districts.set(d.id,{d,centre:c,radius:r,color,born:Math.min(...members.map(m=>m.born)),index:k});
      if(k<DMAX){ground.material.uniforms.uPlots.value[k].set(c.x,0,c.z,r*.9);ground.material.uniforms.uPlotC.value[k].set(color.r,color.g,color.b,0);}k++;
      centre.add(c);n++;}
    for(;k<DMAX;k++)ground.material.uniforms.uPlots.value[k].set(0,0,0,0);
    if(n)centre.multiplyScalar(1/n);extent=6;for(const s of districts.values())extent=Math.max(extent,s.centre.distanceTo(centre)+s.radius);
    ground.material.uniforms.uScale.value=Math.max(900,extent*40);moteMat.uniforms.uBox.value.set(extent*2.2,Math.max(9,extent*.5),extent*2.2);
    // Towers: plinth + storeys in slot order (+ crown / pavilion), spires on the roof.
    const list=[],spireList=[];
    for(const m of [...model.modules.values()].sort((a,b)=>a.order-b.order)){
      const dist=districts.get(m.group);if(!dist)continue;const p=plot(m.q,m.r);
      const born=secs(m.born,epoch),removed=m.removed===null?1e6:secs(m.removed,epoch);
      const tw={id:m.id,pos:p,color:dist.color,storeys:[],born:m.born,top:.3,district:m.group};towers.set(m.id,tw);
      list.push({kind:'plinth',module:m.id,x:p.x,z:p.z,y:0,r:.74,h:.16,look:4,born,removed,color:dist.color.clone().multiplyScalar(.5)});
      const syms=[...m.symbols].map(id=>model.symbols.get(id)).filter(s=>s&&s.kind!=='api.route'&&KINDS[s.kind]).sort((a,b)=>a.slot-b.slot||a.id.localeCompare(b.id));
      const shown=syms.slice(0,16);
      for(const s of shown){const K=KINDS[s.kind];const sb=model.bornAt(s);
        list.push({kind:'storey',module:m.id,symbol:s.id,x:p.x,z:p.z,r:K.r*(arch==='spire'?.8:1),h:K.h*(arch==='gothic'?1.15:1),look:m.test?3:K.look,born:Number.isFinite(sb)?secs(sb,epoch):sb===Infinity?1e6:-1e5,
          removed:s.removed===null?removed:secs(s.removed,epoch),color:dist.color});}
      const extra=Object.entries(m.counts||{}).filter(([x])=>x!=='api.route'&&x!=='property').reduce((a,[,v])=>a+v,0)-shown.length;
      if(extra>0)list.push({kind:'crown',module:m.id,x:p.x,z:p.z,r:.5,h:Math.min(1,.1*Math.log2(1+extra)),look:4,born,removed,color:dist.color.clone().lerp(new THREE.Color('#6b7891'),.6)});
      if(!shown.length&&extra<=0)list.push({kind:'pavilion',module:m.id,x:p.x,z:p.z,r:.5,h:.3,look:4,born,removed,color:dist.color.clone().lerp(new THREE.Color('#7b88a1'),.5)});
      const routes=[...m.symbols].map(id=>model.symbols.get(id)).filter(s=>s&&s.kind==='api.route');
      routes.slice(0,6).forEach((s,j)=>spireList.push({module:m.id,j,n:Math.min(6,routes.length),born:Number.isFinite(model.bornAt(s))?secs(model.bornAt(s),epoch):-1e5,removed:s.removed===null?removed:secs(s.removed,epoch),color:pal.valid.clone().lerp(dist.color,.4)}));
    }
    blocks.ensure(list.length);list.forEach((b,i)=>{blocks.write('bPos',i,b.x,0,b.z,0);blocks.write('bSize',i,b.r,b.h,b.look,rand(hash(b.module+(b.symbol||b.kind))));blocks.write('bLife',i,b.born,b.removed,-1e5,0);
      blocks.write('bState',i,1,1,-1e5,0);blocks.write('bColor',i,b.color.r,b.color.g,b.color.b);blockRefs.push(b);});
    blockCount=list.length;blocks.commit(blockCount);
    spires.ensure(spireList.length);spireList.forEach((s,i)=>{spires.write('pLife',i,s.born,s.removed,0,0);spires.write('pColor',i,s.color.r*2,s.color.g*2,s.color.b*2);});spireCount=spireList.length;spires.commit(spireCount);spireRefs=spireList;
    // Links between towers: conduits within a district (quieter the more there are), bridges between districts.
    const ll=[...model.links.values()].filter(l=>towers.has(l.a)&&towers.has(l.b));const internal=ll.filter(l=>!l.cross).length;const quiet=Math.min(1,3/Math.sqrt(internal+1)+.15);
    links.ensure(ll.length);ll.forEach((l,i)=>{const a=towers.get(l.a),b=towers.get(l.b);const born=model.bornAt(l);
      links.write('kInfo',i,Number.isFinite(born)?secs(born,epoch):born===Infinity?1e6:-1e5,l.removed===null?1e6:secs(l.removed,epoch),l.cross?1:0,rand(hash(l.key)));
      const k2=l.cross?1.2:.8*quiet;links.write('kColA',i,a.color.r*k2,a.color.g*k2,a.color.b*k2);links.write('kColB',i,b.color.r*k2,b.color.g*k2,b.color.b*k2);});
    linkCount=ll.length;links.commit(linkCount);linkRefs=ll;
    builtVersion=model.version;
  }
  let spireRefs=[],linkRefs=[];
  // Per frame: stack heights (storeys settle when one is removed), states, roof spires, link endpoints at rooftops.
  const stackY=new Map();
  function restack(t,epoch){
    const byModule=new Map();blockRefs.forEach((b,i)=>{if(!byModule.has(b.module))byModule.set(b.module,[]);byModule.get(b.module).push(i);});
    for(const [mid,idx] of byModule){const tw=towers.get(mid);let y=0;
      for(const i of idx){const b=blockRefs[i];const alive=b.born<=(t-epoch)/1000+1e-3;const gone=b.removed<1e5&&(t-epoch)/1000>=b.removed;
        const target=y;const key=i;const prev=stackY.get(key);
        if(prev===undefined){stackY.set(key,{y:target,from:target,at:-1e5});}
        else if(Math.abs(prev.y-target)>1e-4){prev.from=lerpSettled(prev,(t-epoch)/1000);prev.y=target;prev.at=(t-epoch)/1000;}
        const s=stackY.get(key);blocks.write('bPos',i,b.x,s.y,b.z,s.from);const life=blocks.arrays.bLife;life[i*4+2]=s.at;
        if(alive&&!gone)y+=b.h+(b.kind==='plinth'?.008:.008);}
      tw.top=Math.max(.3,y);}
    blocks.dirty('bLife');
  }
  const lerpSettled=(s,now)=>{const k=Math.min(1,Math.max(0,(now-s.at)/.6));const e=k*k*(3-2*k);return s.from+(s.y-s.from)*e;};
  // ---- Agents: drones -----------------------------------------------------------------------------------------
  const AGENT_COLORS=['#ff9ee8','#ffd27a','#9dffcf','#a7b8ff','#ffb08a','#8ef0ff','#e2a6ff','#c9ff8a'].map(c=>new THREE.Color(c));
  const agentState=new Map();
  function agentGoal(a,i){
    const tw=a.fileId?towers.get(a.fileId):null,home=a.home?towers.get(a.home):null,dist=home?districts.get(home.district):null;
    if(tw&&a.display==='tool')return tw.pos.clone().setY(tw.top+1.4);
    const ph=rand(hash(a.id))*6.283;
    if(dist){const R=a.display==='waiting'||a.display==='dormant'?dist.radius+1.5:dist.radius*.7,y=a.display==='waiting'||a.display==='dormant'?1.6:3.2,sp=a.busy?.25:.05;
      return new THREE.Vector3(dist.centre.x+Math.cos(ph+i.tview*sp)*R,y+Math.sin(i.tview*.7+ph)*.25,dist.centre.z+Math.sin(ph+i.tview*sp)*R);}
    return new THREE.Vector3(centre.x+Math.cos(ph+i.tview*.06)*extent*.6,4,centre.z+Math.sin(ph+i.tview*.06)*extent*.6);
  }
  function updateAgents(i){
    let n=0;const seen=new Set();
    for(const a of i.agents.slice(0,MAX_AGENTS)){
      seen.add(a.id);let st=agentState.get(a.id);if(!st){st={pos:new THREE.Vector3(),snap:true};agentState.set(a.id,st);}
      const goal=agentGoal(a,i);if(st.snap){st.pos.copy(goal);st.snap=false;}else st.pos.lerp(goal,Math.min(1,i.dt*(a.display==='tool'?2:1.1)));
      const c=AGENT_COLORS[a.voice%8],alpha=a.alpha*(a.busy?1:.5)*G.agentProminence;
      agentPts.write('position',n,st.pos.x,st.pos.y,st.pos.z);agentPts.write('aCol',n,c.r*2,c.g*2,c.b*2,alpha);agentPts.write('aSize',n,2.4);n++;
      // Rotor glints around the drone body.
      for(let k=0;k<4;k++){const u=k/4*6.283+i.tview*9;agentPts.write('position',n,st.pos.x+Math.cos(u)*.22,st.pos.y+.03,st.pos.z+Math.sin(u)*.22);agentPts.write('aCol',n,c.r,c.g,c.b,alpha*.6);agentPts.write('aSize',n,.5);n++;}
      // A beam of light onto the tower it works on (editing pours down, reading scans upward).
      const tw=a.fileId?towers.get(a.fileId):null;
      if(tw&&a.display==='tool'){const inward=a.activity==='reading'||a.activity==='searching';const top=tw.pos.clone().setY(tw.top);
        for(let k=0;k<30&&n<agentPts.capacity;k++){let f=(i.tview*1.1+k/30)%1;if(inward)f=1-f;const p=st.pos.clone().lerp(top,f);p.x+=Math.sin(k*2.1+i.tview)*.12*f;p.z+=Math.cos(k*1.7+i.tview)*.12*f;
          agentPts.write('position',n,p.x,p.y,p.z);agentPts.write('aCol',n,c.r*1.4,c.g*1.4,c.b*1.4,alpha*.7);agentPts.write('aSize',n,.55);n++;}}
    }
    for(const id of agentState.keys())if(!seen.has(id))agentState.delete(id);
    agentPts.commit(n);
  }
  // ---- Effects --------------------------------------------------------------------------------------------------
  let info={tsec:0,tview:0},waveNext=0;const flashes=[];
  function wave(pos,color,speed=4){const k=waveNext++%4;common.uWaves.value[k].set(pos.x,0,pos.z,info.tsec);common.uWaveC.value[k].set(color.r,color.g,color.b,speed);}
  function burst(pos,color,{radius=1.4,duration=1.6,size=1,mode=0}={}){const k=burstNext++%BURSTS;burstU.uBA.value[k].set(pos.x,pos.y,pos.z,info.tsec);burstU.uBB.value[k].set(color.r*1.5,color.g*1.5,color.b*1.5,size);burstU.uBC.value[k].set(duration,mode,radius,0);}
  function flash(a){flashes.push({at:info.tsec,amount:a});if(flashes.length>6)flashes.shift();}
  const topOf=id=>{const tw=towers.get(id);return tw?tw.pos.clone().setY(tw.top):null;};
  function effect(cmd,i){
    if(i)info=i;const s=cmd.subject||{},k=clamp(cmd.scale,0,1.6),ids=(s.fileIds||[]).slice(0,14);
    switch(cmd.effect){
      case 'foundation':{const d=districts.get(s.groupId);if(d){wave(d.centre,d.color,3.5);burst(d.centre.clone().setY(.3),d.color,{radius:d.radius,duration:2,size:1.2});}break;}
      case 'raise':{const p=topOf(s.fileId);if(p)burst(p,new THREE.Color('#d7ecff'),{radius:1,duration:1.4,size:.8});break;}
      case 'storey':{const p=topOf(s.fileId);if(p)burst(p,pal.highlight,{radius:.8*k+.4,duration:1.2,size:.6,mode:2});break;}
      case 'dismantle':{const p=topOf(s.fileId);if(p)burst(p,new THREE.Color(.6,.62,.7),{radius:1.2,duration:1.8,size:.7});break;}
      case 'lock-mechanism':{const a=topOf(s.fileId),b=topOf(s.targetId);if(a&&b){burst(a,pal.highlight,{radius:1.4,duration:2,size:1});burst(b,pal.highlight,{radius:1.4,duration:2,size:1});if(cmd.tier>=2){wave(a.clone().lerp(b,.5),pal.highlight,4);flash(.08);}}break;}
      case 'stress-fracture':{for(const id of ids){const p=topOf(id);if(p)burst(p,pal.warning,{radius:1,duration:2,size:.8});}if(ids.length){wave(topOf(ids[0])||centre,pal.warning,3);}flash(.06*k);break;}
      case 'window-scan':{for(const id of ids){const p=topOf(id);if(p)burst(p,pal.valid,{radius:.8,duration:1.6,size:.6,mode:2});}break;}
      case 'restore':{for(const id of ids){const p=topOf(id);if(p)burst(p,pal.valid,{radius:1.4,duration:2.2,size:1,mode:2});}if(ids.length)wave(topOf(ids[0])||centre,pal.valid,3.5);flash(.18*k);break;}
      case 'reassemble':{for(const id of ids){const p=topOf(id);if(p)burst(p,pal.highlight,{radius:1.6,duration:2.2,size:1});}flash(.1);break;}
      case 'illumination':{for(const id of ids){const p=topOf(id);if(p)burst(p,pal.valid.clone().lerp(new THREE.Color('#fff4d6'),.5),{radius:4,duration:3,size:1.4,mode:2});}
        wave(centre,pal.valid.clone().lerp(new THREE.Color('#fff4d6'),.5),5);flash((cmd.tier>=4?.9:.45)*k);break;}
      case 'set-in-stone':{wave(centre,new THREE.Color('#ffe2a6'),4.5);break;}
      case 'district-lights':{wave(centre,pal.accent,5);break;}
      default:break;
    }
  }
  // ---- Frame ----------------------------------------------------------------------------------------------------
  function rebuild(){builtVersion=-1;stackY.clear();for(const s of agentState.values())s.snap=true;}
  function update(i){
    info=i;const epoch=model.epoch;
    common.uT.value=i.tsec;common.uV.value=i.tview;common.uSpeed.value=ctx.speed();common.uBeat.value=i.beat*G.music.beatPulse;common.uActivity.value=i.activity;
    common.uPx.value=Math.max(.5,ctx.pipeline.size[1]/1080);common.uRes.value.set(ctx.pipeline.size[0],ctx.pipeline.size[1]);
    if(model.version!==builtVersion){build(i.t);stackY.clear();}
    restack(i.t,epoch);
    // District plots light up with their first tower.
    for(const s of districts.values()){if(s.index>=DMAX)continue;const age=(i.t-s.born)/1000/ctx.speed();ground.material.uniforms.uPlotC.value[s.index].w=clamp(age/2)*(1+.3*i.activity);}
    // States and agent highlight per instance.
    const states=new Map();for(const tw of towers.values()){const m=model.modules.get(tw.id);let cur=m.initial,prev=m.initial,at=-1e5;for(const e of m.states){if(e.at>i.t)break;prev=cur;cur=e.state;at=secs(e.at,epoch);}states.set(tw.id,[STATE_INDEX[cur]??1,STATE_INDEX[prev]??1,at]);}
    blockRefs.forEach((b,k)=>{const s=states.get(b.module)||[1,1,-1e5];blocks.write('bState',k,b.kind==='plinth'?Math.max(1,s[0]):s[0],b.kind==='plinth'?Math.max(1,s[1]):s[1],s[2],0);});blocks.flush();
    spireRefs.forEach((s,k)=>{const tw=towers.get(s.module);const a=s.j/Math.max(1,s.n)*6.283+.4,rr=s.n>1?.28:0;spires.write('pPos',k,tw.pos.x+Math.sin(a)*rr,tw.top,tw.pos.z+Math.cos(a)*rr,.62);});spires.flush();
    linkRefs.forEach((l,k)=>{const a=towers.get(l.a),b=towers.get(l.b);const ya=l.cross?a.top:.2,yb=l.cross?b.top:.2;links.write('kA',k,a.pos.x,ya,a.pos.z,0);links.write('kB',k,b.pos.x,yb,b.pos.z,0);});links.flush();
    // Mechanisms around the tallest towers (count from the recipe), searchlights at district centres.
    const tall=[...towers.values()].filter(tw=>model.alive(model.modules.get(tw.id),i.t)).sort((a,b)=>b.top-a.top).slice(0,Math.round(MECH*G.secondary.mechanisms*.5));
    tall.forEach((tw,k)=>{mechs.write('mPos',k,tw.pos.x,tw.top*.6,tw.pos.z,.9+.25*(k%3));const m=model.modules.get(tw.id);mechs.write('mInfo',k,secs(m.born,epoch)+2,(k%2?-1:1)*(.15+.1*rand(k)),k*1.7,(rand(k+5)-.5)*.5);
      const c=tw.color;mechs.write('mColor',k,c.r*.8,c.g*.8,c.b*.8);});mechCount=tall.length;mechs.commit(mechCount);
    let li=0;for(const s of districts.values()){if(li>=LIGHTS)break;lights.write('sPos',li,s.centre.x,.2,s.centre.z,Math.max(14,extent*.9));lights.write('sInfo',li,G.atmosphere.searchlights*.5+.5,.12+.08*rand(li),li*2.3,0);lights.write('sColor',li,s.color.r,s.color.g,s.color.b);li++;}lights.commit(li);
    updateAgents(i);
    common.uUnlock.value.set(i.unlocks[0]?.level||0,i.unlocks[1]?.level||0,i.unlocks[2]?.level||0,i.unlocks[3]?.level||0);
  }
  function afterCamera(){sky.uniforms.uInv.value.copy(camera.projectionMatrixInverse).premultiply(camera.matrixWorld);sky.uniforms.uCam.value.copy(camera.position);}
  function background(){return sky;}
  function grade(i){const L=G.light,inten=i.overrides.intensity??1;let f=0;for(const x of flashes){const age=(i.tsec-x.at)/ctx.speed();if(age>=0&&age<3)f+=x.amount*Math.exp(-age*2);}
    return {bloom:L.bloom*(1+.2*i.activity),threshold:L.bloomThreshold,exposure:L.exposure*1.1,contrast:L.contrast,saturation:1.05,vignette:L.vignette,grain:L.grain,flash:f*inten,waves:[],
      tint:i.mood.section==='tension'?new THREE.Vector3(1.06,.95,.9):i.mood.section==='resolve'?new THREE.Vector3(.95,1.04,1):new THREE.Vector3(1,1,1)};}
  // ---- Camera: an architectural orbit (or a slow procession along the streets) ------------------------------------
  function cameraGoal(i){
    const C=G.camera,fov=C.fov,aspect=camera.aspect||16/9,tanHalf=Math.tan(THREE.MathUtils.degToRad(fov)/2);
    let tallest=1;for(const tw of towers.values())tallest=Math.max(tallest,tw.top);
    const fit=Math.max(extent/Math.min(aspect,1.8),tallest)/tanHalf*.95*C.distance;
    const baseAz=rand(seed)*6.283-.9;let az=baseAz+(C.personality==='architectural'?i.tview*Math.PI*2/560:Math.sin(i.tview/90)*.8)*(i.overrides.motion??1);
    const el=C.elevation+.04*Math.sin(i.tview/60);let target=centre.clone().setY(Math.min(1.5,tallest*.3)),distance=Math.max(9,fit);
    const att=ctx.director.attentionAt(i.t,2),since=att?(i.t-att.at)/ctx.speed()/1000:Infinity;
    if(since<14&&att){const a=subjectOf(att);if(a){const k=smooth(1-Math.max(0,since-9)/5);target.lerp(a.pos,.65*k);distance=lerp(distance,Math.min(distance,Math.max(7,a.radius/tanHalf*1.3)),k);}}
    else{const busy=i.agents.find(a=>a.display==='tool'&&a.fileId&&towers.has(a.fileId));
      if(busy){const tw=towers.get(busy.fileId);const d=districts.get(tw.district);target.lerp(tw.pos.clone().setY(tw.top*.5),.35);distance=lerp(distance,Math.max(7,(d?.radius||3)*1.8/tanHalf),.35);}
      else if(i.phase==='idle'&&districts.size>1){const list=[...districts.values()].sort((a,b)=>a.index-b.index);const s=list[Math.floor(i.tview/26)%list.length];target.lerp(s.centre,.5);distance=lerp(distance,Math.max(8,s.radius*2/tanHalf),.45);}}
    return {target,distance,azimuth:az,elevation:el,fov,omega:.7};
  }
  function subjectOf(c){const s=c.subject||{};
    if(s.fileId&&towers.has(s.fileId)){const a=towers.get(s.fileId);if(s.targetId&&towers.has(s.targetId)){const b=towers.get(s.targetId);return {pos:a.pos.clone().lerp(b.pos,.5).setY(Math.max(a.top,b.top)*.6),radius:a.pos.distanceTo(b.pos)*.6+2};}
      const d=districts.get(a.district);return {pos:(d?d.centre.clone():a.pos.clone()).lerp(a.pos,.5).setY(a.top*.5),radius:(d?.radius||3)+.5};}
    if(s.groupId&&districts.get(s.groupId)){const d=districts.get(s.groupId);return {pos:d.centre.clone(),radius:d.radius+1};}
    const list=(s.fileIds||[]).map(id=>towers.get(id)).filter(Boolean);if(list.length){const c0=new THREE.Vector3();for(const t of list)c0.add(t.pos);c0.multiplyScalar(1/list.length);let r=3;for(const t of list)r=Math.max(r,t.pos.distanceTo(c0)+1.5);return {pos:c0,radius:r};}
    return null;}
  // ---- Words ---------------------------------------------------------------------------------------------------
  const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
  const dName=id=>{const d=model.districts.get(id);return d?`${ctx.name(id)} · ${d.role}`:ctx.name(id);};
  const MILESTONE={'first-validation':'First validation','integration-validated':'Integration validated','recovery':'Recovery','refactor':'Refactor validated'};
  function describe(c){const s=c.subject||{},d=c.detail||{},n=(s.fileIds||[]).length;const pos=subjectOf(c)?.pos;
    switch(c.intent){
      case 'subsystem.created':return {text:'A new district is founded',sub:dName(s.groupId),position:pos};
      case 'structure.created':return {text:'New storeys rise',sub:Object.entries(d.kinds||{}).filter(([k])=>k!=='variable').map(([k,v])=>`${v} ${k.replace('ui.component','glass storey').replace('api.route','spire').replace('class','block').replace('function','floor')}`).join(' · ')||plural(d.count||1,'storey'),position:pos};
      case 'subsystem.connected':{const ga=towers.get(s.fileId)?.district,gb=towers.get(s.targetId)?.district;return {text:d.first?'Integration · a bridge locks two districts':'A bridge between districts strengthens',sub:ga&&gb?`${ctx.name(ga)} ↔ ${ctx.name(gb)}`:'',position:pos};}
      case 'validation.failed':return {text:`Tests fail · strain in ${plural(n,'tower')}`,sub:'observed failing run',position:pos,color:'#ff8a6a'};
      case 'validation.passed':return {text:`Tests pass · ${plural(n,'tower')} lit`,sub:'observed passing run',position:pos,color:'#9dffcf'};
      case 'validation.recovered':return {text:`Recovered · ${plural(d.repaired||n,'tower')} restored`,sub:'the tests pass again',position:pos,color:'#9dffcf',banner:'Recovery',bannerSub:'the tests pass again'};
      case 'refactor.validated':return {text:'Refactor validated · the structure consolidates',sub:plural(d.removedSymbols||0,'symbol')+' removed',position:pos,banner:'Refactor validated',bannerSub:'verified by a passing test run'};
      case 'milestone.achieved':{const k=(d.kinds||[]).map(x=>MILESTONE[x]||x);return {text:`Illumination · ${k.join(' + ')}`,sub:'verified by a passing test run',position:pos,banner:k.join(' · '),bannerSub:'milestone · verified by a passing test run'};}
      case 'repository.checkpoint':return {text:`Committed · ${plural(n,'tower')} set in stone`,sub:'commit observed',position:pos};
      case 'world.expanded':return {text:`The cathedral grows · chapter ${d.chapter}`,sub:'accumulated structure',position:centre.clone().setY(2)};
      default:return null;}}
  function agentPosition(id){return agentState.get(id)?.pos||null;}
  function agentColor(a){return '#'+AGENT_COLORS[a.voice%8].getHexString();}
  function subsystemLabels(){return [...districts.values()].map(s=>({position:s.centre.clone().setY(2.5),text:ctx.name(s.d.id),sub:`${s.d.role} · ${plural(s.d.members.length,'module')}`}));}
  function status(i){let v=0,st=0;for(const m of model.modules.values()){if(!model.alive(m,i.t))continue;const s=model.stateAt(m,i.t);if(s==='validated')v++;if(s==='stressed')st++;}return st?`${st} under strain`:v?`${v} validated`:'';}
  function pick(x,y,cam){let best=null,bd=.05;for(const [id,tw] of towers){const p=tw.pos.clone().setY(tw.top*.6).project(cam);const d=Math.hypot(p.x-x,(p.y-y)*.6);if(p.z<1&&d<bd){bd=d;best=id;}}return best;}
  function inspect(id,i){const tw=towers.get(id),m=model.modules.get(id);if(!tw||!m)return null;const deps=[...model.links.values()].filter(l=>(l.a===id||l.b===id)&&model.alive(l,i.t)).length;
    return {position:tw.pos.clone().setY(tw.top),text:`A tower · ${model.stateAt(m,i.t)}`,sub:`${plural(model.symbolsAt(m,i.t),'storey')} · ${plural(deps,'link')} · ${ctx.name(m.group)}`};}
  function stats(){return {districts:districts.size,towers:towers.size,blocks:blockCount,spires:spireCount,links:linkCount,mechanisms:mechCount,architecture:arch,camera:camera.position.toArray().map(x=>+x.toFixed(1)),extent:+extent.toFixed(1)};}
  function dispose(){for(const o of [ground,blockMesh,spireMesh,linkMesh,mechMesh,motePoints,lightMesh,agentPoints,burstPoints]){scene.remove(o);o.geometry.dispose();o.material.dispose();}sky.dispose();prism.dispose();spireGeo.dispose();ribbon.dispose();}
  return {rebuild,update,afterCamera,background,grade,cameraGoal,effect,describe,agentPosition,agentColor,subsystemLabels,status,pick,inspect,stats,dispose};
}

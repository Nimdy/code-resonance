// A starter world for the Code Resonance Visual Pack SDK 1. Read docs/packs/world-api.md, then replace everything.
// Rules that keep a world correct: draw only from sdk.model / sdk.director / sdk.agents and the frame; take time from
// the frame (frame.tsec, frame.tview), never from Date.now or performance.now; use sdk.random(key) for randomness;
// after a seek (onPrime) clear transient effects and rebuild lasting ones from sdk.director.lasting().
export function createWorld(sdk){
  const {THREE,scene,model,params}=sdk;
  const gold=new THREE.Color('#ffd27a'),warn=sdk.palette.warning||new THREE.Color('#ff6a4a');
  // Modules: instanced spheres; colour and size are written every frame from the model.
  const sphere=new THREE.SphereGeometry(1,16,12);
  const spheres=sdk.buffers.instanced(sphere,{iPos:4,iCol:3},64);
  const material=new THREE.ShaderMaterial({uniforms:{uT:{value:0},uBeat:{value:0}},
    vertexShader:'attribute vec4 iPos;attribute vec3 iCol;uniform float uBeat;varying vec3 vCol;varying float vLight;void main(){vec3 p=position*iPos.w*(1.+.08*uBeat)+iPos.xyz;vCol=iCol;vLight=.5+.5*normal.y;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}',
    fragmentShader:'varying vec3 vCol;varying float vLight;void main(){gl_FragColor=vec4(vCol*(.6+.8*vLight),1.);}'});
  const mesh=new THREE.Mesh(spheres.geometry,material);mesh.frustumCulled=false;scene.add(mesh);
  let built=-1,places=new Map(),transient=new Map(),crowns=new Map();
  function build(){
    built=model.version;places=new Map();
    const districts=[...model.districts.values()].filter(d=>model.districtBorn(d)<Infinity).sort((a,b)=>a.order-b.order);
    districts.forEach((d,i)=>{const a=i*2.39996,r=4*Math.sqrt(i);const cx=Math.cos(a)*r,cz=Math.sin(a)*r;
      d.members.forEach((id,k)=>{const b=k/Math.max(1,d.members.length)*Math.PI*2;places.set(id,{x:cx+Math.cos(b)*1.6,z:cz+Math.sin(b)*1.6,district:d.id});});});
    rebuildLasting();
  }
  function rebuildLasting(){crowns=new Map();for(const l of sdk.director.lasting())for(const id of l.subject?.fileIds||[])crowns.set(id,(crowns.get(id)||0)+l.count);}
  const secs=ms=>(ms-model.epoch)/1000;
  return {
    rebuild(){built=-1;},
    update(frame){
      if(model.version!==built)build();
      material.uniforms.uBeat.value=frame.beat;let n=0;spheres.ensure(Math.max(1,places.size));
      for(const [id,p] of places){const m=model.modules.get(id);if(!m||!model.alive(m,frame.t))continue;
        const state=model.stateAt(m,frame.t),alarm=(frame.tsec-(transient.get(id)??-1e9))/sdk.speed();
        const c=state==='stressed'||(alarm>=0&&alarm<3)?warn:state==='validated'?gold:(sdk.palette.primary||gold);
        const size=.25*(params.size||1)*(1+.12*Math.min(10,model.symbolsAt(m,frame.t)))*(1+.3*Math.min(3,crowns.get(id)||0));
        const turn=frame.tview*(params.spin||.05);
        spheres.write('iPos',n,p.x*Math.cos(turn)-p.z*Math.sin(turn),size,p.x*Math.sin(turn)+p.z*Math.cos(turn),size);spheres.write('iCol',n,c.r,c.g,c.b);n++;}
      spheres.commit(n);
    },
    cameraGoal(frame){const r=4+3*Math.sqrt(model.districts.size);return {target:new THREE.Vector3(),distance:r*2.2,azimuth:.5,elevation:.6,fov:40};},
    effect(cmd){if(cmd.effect==='alarm')for(const id of cmd.subject?.fileIds||[])transient.set(id,secs(cmd.at));if(cmd.effect==='crown')rebuildLasting();},
    describe(cmd){return {alarm:{text:'Tests fail',sub:'observed failing run'},crown:{text:'Milestone',sub:'verified by a passing test run',banner:'Milestone',bannerSub:'verified'}}[cmd.effect]||null;},
    onPrime(){transient=new Map();rebuildLasting();},
    stats(){return {spheres:places.size};},
    dispose(){scene.remove(mesh);mesh.geometry.dispose();material.dispose();sphere.dispose();}
  };
}

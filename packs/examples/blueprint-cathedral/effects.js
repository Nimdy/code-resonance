// Blueprint Cathedral: procedural survey rings (Visual Pack SDK 1, shader pack effects module).
// Passing runs, recoveries and commits draw a survey ring around the city; a verified milestone draws a large double
// ring that rises. Rings are pure functions of time since their command, and a seek clears them (onPrime).
export function createEffects(sdk){
  const {THREE,scene}=sdk;
  const geometry=new THREE.TorusGeometry(1,.012,6,160);
  const pool=Array.from({length:8},()=>{
    const material=new THREE.MeshBasicMaterial({color:new THREE.Color('#9fe8ff'),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
    const mesh=new THREE.Mesh(geometry,material);mesh.rotation.x=Math.PI/2;mesh.visible=false;mesh.frustumCulled=false;scene.add(mesh);
    return {mesh,start:-1e9,scale:1,big:false};});
  const SURVEY=new Set(['window-scan','restore','set-in-stone','illumination']);
  let next=0;
  return {
    effect(cmd){
      if(!SURVEY.has(cmd.effect))return;
      const ring=pool[next++%pool.length];ring.start=(cmd.at-sdk.model.epoch)/1000;ring.scale=Math.max(.5,Math.min(1.6,cmd.scale));ring.big=cmd.effect==='illumination';
    },
    update(frame){
      for(const ring of pool){
        const life=ring.big?6:2.8,age=(frame.tsec-ring.start)/sdk.speed(),on=age>=0&&age<life;ring.mesh.visible=on;if(!on)continue;
        const k=age/life;ring.mesh.scale.setScalar((ring.big?22:12)*ring.scale*(.25+k));
        ring.mesh.position.y=ring.big?.2+k*3:.15;ring.mesh.material.opacity=(1-k)*(ring.big?.9:.55)*(.85+.15*frame.beat);
      }
    },
    onPrime(){for(const ring of pool){ring.start=-1e9;ring.mesh.visible=false;}},
    dispose(){for(const ring of pool){scene.remove(ring.mesh);ring.mesh.material.dispose();}geometry.dispose();}
  };
}

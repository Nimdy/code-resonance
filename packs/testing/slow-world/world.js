// TEST FIXTURE, not a visual pack: every frame takes about 400 ms of CPU (a pack far too slow for live playback).
// Used by qualification/visual/robustness.qual.js and the CI pack checks. Never install it for real use.
export function createWorld(sdk){
  const {THREE,scene}=sdk;let frames=0;
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshBasicMaterial({color:new THREE.Color('#5fd0ff')}));scene.add(mesh);
  return {
    rebuild(){},
    update(frame){frames++;mesh.scale.setScalar(1+.2*frame.beat);mesh.rotation.y=frame.tview*.5;const until=performance.now()+400;while(performance.now()<until){}},
    cameraGoal(){return {target:new THREE.Vector3(),distance:6,azimuth:.6,elevation:.4,fov:40};},
    effect(){},
    stats(){return {fixtureFrames:frames};},
    dispose(){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
  };
}

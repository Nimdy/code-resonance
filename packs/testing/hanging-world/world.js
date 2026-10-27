// TEST FIXTURE, not a visual pack: enters an endless loop 10 s after it starts (once it has rendered 40 frames): a broken pack.
// Used by qualification/visual/robustness.qual.js and the CI pack checks. Never install it for real use.
export function createWorld(sdk){
  const {THREE,scene}=sdk;let frames=0;const started=performance.now();
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshBasicMaterial({color:new THREE.Color('#5fd0ff')}));scene.add(mesh);
  return {
    rebuild(){},
    update(frame){frames++;mesh.scale.setScalar(1+.2*frame.beat);mesh.rotation.y=frame.tview*.5;if(frames>=40&&performance.now()-started>10000)for(;;){}},
    cameraGoal(){return {target:new THREE.Vector3(),distance:6,azimuth:.6,elevation:.4,fov:40};},
    effect(){},
    stats(){return {fixtureFrames:frames};},
    dispose(){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
  };
}

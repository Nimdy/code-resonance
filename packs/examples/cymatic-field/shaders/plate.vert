// A resonant plate: an instanced disc lying on the floor of the hall.
attribute vec4 iA;      // centre x, centre z, radius, born
attribute vec4 iS;      // last strike, last clear tone, last dissonance, resonance (lasting milestones)
attribute vec3 iCol;
uniform float uT,uSpeed;
varying vec2 vUv;varying vec3 vWorld,vCol;varying vec4 vS;varying float vBorn,vR;
void main(){
  vBorn=clamp((uT-iA.w)/(2.*uSpeed),0.,1.);
  float r=iA.z*(.6+.4*smoothstep(0.,1.,vBorn))*1.12;
  vec3 world=vec3(iA.x+position.x*r,0.,iA.y+position.y*r);
  vUv=position.xy*1.12;vWorld=world;vCol=iCol;vS=iS;vR=iA.z;
  gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);
}

// Effect rings: pooled flat quads; a ring expands from its start time over its duration (seek-safe: pure function
// of time, cleared after a seek).
attribute vec4 rA;   // x, z, max radius, start
attribute vec4 rB;   // r, g, b, duration
uniform float uT,uSpeed;
varying vec2 vUv;varying vec3 vCol;varying float vAge;
void main(){
  vAge=(uT-rA.w)/uSpeed/max(.01,rB.w);vCol=rB.rgb;vUv=position.xy;
  float r=rA.z*max(.02,vAge);vec3 world=vec3(rA.x+position.x*r,.06,rA.y+position.y*r);
  gl_Position=(vAge<0.||vAge>1.)?vec4(2.,2.,2.,1.):projectionMatrix*viewMatrix*vec4(world,1.);
}

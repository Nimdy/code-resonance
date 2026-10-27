// Sympathetic bridges between plates (dependencies across subsystems): arcs carrying a standing wave.
attribute vec3 aA;attribute vec3 aB;attribute vec4 aInfo;   // t along the arc, seed, born, last flash
uniform float uT,uSpeed,uBeat,uHeight;
varying float vAlpha,vT;varying float vFlash;
void main(){
  float t=aInfo.x;vec3 p=mix(aA,aB,t);float len=distance(aA.xz,aB.xz);
  p.y+=sin(t*PI)*(.6+len*.18)*uHeight;
  float harm=2.+floor(h11(aInfo.y)*4.);
  p.y+=sin(t*PI*harm)*sin(uT/uSpeed*3.1+aInfo.y*6.)*.08*(1.+uBeat);
  vAlpha=clamp((uT-aInfo.z)/(2.*uSpeed),0.,1.);vT=t;
  float f=(uT-aInfo.w)/uSpeed;vFlash=f>0.&&f<4.?1.-f/4.:0.;
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
}

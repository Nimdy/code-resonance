// Agents (tuning forks hovering over the plate they work on; positions from the CPU) and golden dust (an ambient layer
// a verified milestone unlocks: motes rising through the hall, positions from time only).
attribute vec4 pA;   // x, y, z, size (agents); home x, z, seed, size (dust)
attribute vec4 pB;   // r, g, b, alpha
uniform float uT,uSpeed,uDust,uPx,uExtent;uniform int uMode;
varying vec3 vCol;varying float vAlpha;
void main(){
  vec3 world=pA.xyz;float alpha=pB.a;
  if(uMode==1){float s=pA.z,rise=fract(s*7.3+uT/uSpeed*(.012+.02*h11(s)));world=vec3(pA.x+sin(uT/uSpeed*.2+s*20.)*.3,rise*uExtent*.55,pA.y);alpha*=uDust*sin(rise*PI);}
  vec4 mv=modelViewMatrix*vec4(world,1.);gl_Position=projectionMatrix*mv;
  vCol=pB.rgb;vAlpha=alpha;gl_PointSize=uPx*pA.w*40./max(1.,-mv.z);
}

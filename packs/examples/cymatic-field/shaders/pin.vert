// Resonators: one slender pin per module, rising when the module is born; colour is its state (draft, committed,
// validated, stressed), set per frame.
attribute vec4 iPos;    // x, z, height, born
attribute vec3 iCol;
uniform float uT,uSpeed,uBeat;
varying vec3 vCol;varying float vShade;
void main(){
  float grow=clamp((uT-iPos.w)/(1.6*uSpeed),0.,1.);grow=grow*grow*(3.-2.*grow);
  vec3 p=position;p.xz*=.055;p.y=(p.y+.5)*iPos.z*grow*(1.+.06*uBeat);
  vec3 world=vec3(iPos.x,0.,iPos.y)+p;
  vShade=.55+.45*normal.y+.3*(position.y+.5);vCol=iCol*(grow>0.?1.:0.);
  gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);
}

// Drafting paper behind the cathedral: deep blue, a fine and a coarse grid in screen space, a little fibre noise.
varying vec2 vUv;
uniform vec2 uRes;uniform float uTime,uBeat,uGrid;uniform vec3 uDeep;
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  vec2 px=vUv*uRes,cell=px/max(4.,uRes.y/uGrid);
  float fine=1.-smoothstep(0.,.06,min(abs(fract(cell.x)-.5),abs(fract(cell.y)-.5))-.44);
  vec2 big=cell/5.;float coarse=1.-smoothstep(0.,.03,min(abs(fract(big.x)-.5),abs(fract(big.y)-.5))-.47);
  vec3 c=vec3(.02,.06,.14)+uDeep*.3;
  c+=vec3(.1,.3,.5)*(fine*.08+coarse*.16)*(.9+.1*uBeat);
  c+=(h(floor(px*.5))-.5)*.012;
  gl_FragColor=vec4(c,1.);
}

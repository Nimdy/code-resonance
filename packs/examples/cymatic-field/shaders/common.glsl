// Cymatic Field: shared GLSL (prepended to every shader of the world).
// Chladni figures: a vibrating plate's sand settles where the standing wave does not move (the nodal lines).
// Square-plate mode (m, n) on [-1, 1]^2, and a radial variant (m nodal diameters, n nodal circles).
#define PI 3.14159265
float chladniSquare(vec2 p,float m,float n){return cos(n*PI*p.x)*cos(m*PI*p.y)-cos(m*PI*p.x)*cos(n*PI*p.y);}
float chladniRadial(vec2 p,float m,float n){float r=length(p),a=atan(p.y,p.x);return cos(m*a)*cos(n*PI*r)+.35*cos((m+1.)*a)*sin(n*PI*r*.9);}
// The plate's field: two modes blended (the plate morphs between them), symmetry 0 = square, 1 = radial.
float field(vec2 p,vec4 modes,float blend,float symmetry){
  float a=mix(chladniSquare(p,modes.x,modes.y),chladniRadial(p,modes.x,modes.y),symmetry);
  float b=mix(chladniSquare(p,modes.z,modes.w),chladniRadial(p,modes.z,modes.w),symmetry);
  return mix(a,b,blend);
}
float h11(float n){return fract(sin(n)*43758.5453123);}
vec2 h21(float n){return fract(sin(vec2(n,n+17.31))*vec2(43758.5453,22578.1459));}

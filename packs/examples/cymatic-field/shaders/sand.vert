// Sand: every grain belongs to a plate and settles on the plate's nodal lines (damped Newton steps on the field).
// Grains appear with the structure they stand for (a module brings a handful, every symbol a pinch) and scatter when
// it is removed. Positions are recomputed from the grain's home every frame, so the image depends only on time.
#define MAXP 48
attribute float aPlate;attribute vec2 aHome;attribute float aSeed;attribute vec2 aLife;
uniform vec4 uPlateA[MAXP];   // centre x, centre z, radius, born
uniform vec4 uModes[MAXP];    // mode A (m, n), mode B (m, n)
uniform vec4 uPlateS[MAXP];   // blend, chaos (dissonance), glow (clear tone), shimmer phase
uniform vec3 uPlateCol[MAXP];
uniform float uT,uSpeed,uBeat,uPx,uSymmetry,uShimmer,uScatter;
varying vec3 vCol;varying float vAlpha;
// Field value and gradient: analytic for the square plate, finite differences for the radial one.
vec3 fgSquare(vec2 p,float m,float n){
  float cnx=cos(n*PI*p.x),snx=sin(n*PI*p.x),cmy=cos(m*PI*p.y),smy=sin(m*PI*p.y),cmx=cos(m*PI*p.x),smx=sin(m*PI*p.x),cny=cos(n*PI*p.y),sny=sin(n*PI*p.y);
  return vec3(cnx*cmy-cmx*cny,-n*PI*snx*cmy+m*PI*smx*cny,-m*PI*cnx*smy+n*PI*cmx*sny);
}
vec3 fgRadial(vec2 p,float m,float n){float e=.004,f=chladniRadial(p,m,n);return vec3(f,(chladniRadial(p+vec2(e,0.),m,n)-f)/e,(chladniRadial(p+vec2(0.,e),m,n)-f)/e);}
vec3 fg(vec2 p,vec4 modes,float blend){
  vec3 a=uSymmetry<.5?fgSquare(p,modes.x,modes.y):fgRadial(p,modes.x,modes.y);
  vec3 b=uSymmetry<.5?fgSquare(p,modes.z,modes.w):fgRadial(p,modes.z,modes.w);
  return mix(a,b,blend);
}
void main(){
  int k=int(aPlate+.5);vec4 A=uPlateA[k],M=uModes[k],S=uPlateS[k];
  vec2 p=aHome;float sharp=0.;
  for(int i=0;i<4;i++){vec3 f=fg(p,M,S.x);p-=f.x*f.yz/(dot(f.yz,f.yz)+.35)*.9;float r=length(p);if(r>.96)p*=.96/r;sharp=f.x;}
  float chaos=clamp(S.y,0.,1.);
  vec2 j=(h21(aSeed*7.13)-.5)*(.006+.012*uBeat*uShimmer+chaos*.22);
  p=mix(p,aHome*.96,chaos*.65)+j;
  // Removed structure scatters outward and fades.
  float gone=clamp((uT-aLife.y)/(1.6*uSpeed),0.,1.);p*=1.+gone*.25;
  float born=clamp((uT-aLife.x)/(1.4*uSpeed),0.,1.)*clamp((uT-A.w)/(1.2*uSpeed),0.,1.);
  vec3 world=vec3(A.x+p.x*A.z,.025+.03*h11(aSeed)+gone*.4,A.y+p.y*A.z);
  vec4 mv=modelViewMatrix*vec4(world,1.);gl_Position=projectionMatrix*mv;
  float line=exp(-abs(sharp)*6.);
  vCol=uPlateCol[k]*(.45+.55*line)*(1.+.9*S.z+.35*uBeat*uShimmer)+vec3(1.,.82,.5)*S.z*.35;
  vCol=mix(vCol,vec3(1.,.28,.18)*1.3,chaos*.8);
  vAlpha=born*(1.-gone)*(.55+.45*line);
  gl_PointSize=uPx*(.7+.6*h11(aSeed*3.7))*(1.+.4*S.z)*46./max(1.,-mv.z);
}

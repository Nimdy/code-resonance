// Brushed dark metal with concentric tooling, ripples from agents at work and from strikes, a rim that rings with
// clear tones, red flicker in dissonance, and golden halos for each verified milestone that touched the plate.
#define MAXA 8
uniform float uT,uSpeed,uBeat;uniform vec4 uAgents[MAXA];uniform vec3 uDeep,uGold,uWarn;
varying vec2 vUv;varying vec3 vWorld,vCol;varying vec4 vS;varying float vBorn,vR;
void main(){
  float r=length(vUv);if(r>1.12)discard;
  float age=uT;
  // Dark brushed metal, lit from above: a soft sheen across the disc and fine tooling rings.
  float sheen=.55+.45*cos((vUv.x*.6+vUv.y)*2.2);
  vec3 c=(uDeep*1.7+vec3(.012)+vCol*.03)*(.7+.45*sheen)*(1.-.35*r*r);
  c+=vCol*.025*(.5+.5*sin(r*96.));
  // Ripples: agents excite the plate where they work; a strike sends one ring outward.
  for(int i=0;i<MAXA;i++){vec4 a=uAgents[i];if(a.z<=0.)continue;float d=distance(vWorld.xz,a.xy);
    c+=vCol*a.z*.18*max(0.,sin(d*14.-uT/uSpeed*5.+a.w))*exp(-d*1.4)*step(r,1.);}
  float strike=(uT-vS.x)/uSpeed;if(strike>0.&&strike<3.){float ring=exp(-pow((r-strike*.55)*14.,2.))*(1.-strike/3.);c+=vCol*ring*1.6;}
  float tone=(uT-vS.y)/uSpeed;float glow=tone>0.&&tone<4.?(1.-tone/4.):0.;
  float diss=(uT-vS.z)/uSpeed;float bad=diss>0.&&diss<8.?(1.-diss/8.):0.;
  float rim=smoothstep(.95,1.,r)*smoothstep(1.06,1.,r);
  c+=rim*(vCol*(.8+.35*uBeat)+uGold*glow*1.4);
  c=mix(c,c+uWarn*.25*(.6+.4*sin(uT/uSpeed*24.+r*30.)),bad*step(r,1.));
  // Lasting resonance: one golden halo per verified milestone (up to four).
  for(int k=0;k<4;k++){if(float(k)>=vS.w)break;float hr=1.04+float(k)*.022;c+=uGold*exp(-pow((r-hr)*120.,2.))*(.9+.3*uBeat);}
  gl_FragColor=vec4(c*vBorn,1.);
}

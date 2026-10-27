// The hall: a dark floor with faint concentric tooling around the plates, a deep gradient above the horizon, and the
// ambient layers verified milestones unlock (an aurora field, distant plates).
varying vec2 vUv;
uniform mat4 uInv;uniform vec3 uCam,uDeep,uHaze,uAccent,uGold;uniform vec2 uCentre;uniform float uT,uSpeed,uAurora,uDistant,uBeat,uExtent;
void main(){
  vec4 q=uInv*vec4(vUv*2.-1.,1.,1.);vec3 d=normalize(q.xyz/q.w-uCam);float h=d.y;
  vec3 c=mix(uHaze*.22,uDeep*.55,smoothstep(0.,.55,h));
  if(h<0.){
    // The floor: where the view ray meets the ground plane.
    vec3 fp=uCam+d*(-uCam.y/min(-1e-3,h));float dist=length(fp.xz-uCentre)/max(1.,uExtent);
    float rings=.5+.5*sin(dist*uExtent*5.-uT/uSpeed*.15);
    c=uDeep*.45+uHaze*.08*exp(-dist*1.2)+uAccent*.012*rings*exp(-dist*.9);
    c*=1.-smoothstep(1.2,3.2,dist)*.6;
  }
  float a=atan(d.z,d.x);
  float band=sin(a*3.+uT/uSpeed*.03)*.5+.5;
  c+=mix(uAccent,uGold,band)*uAurora*.14*smoothstep(.12,.5,h)*smoothstep(.95,.45,h)*(.6+.4*sin(a*7.+h*20.-uT/uSpeed*.2));
  float cell=fract(a*6./PI*2.),row=fract(h*9.);
  c+=uGold*uDistant*.25*exp(-pow(length(vec2(cell,row)-.5)*9.,2.))*smoothstep(.15,.4,h)*(.6+.4*uBeat);
  gl_FragColor=vec4(c,1.);
}

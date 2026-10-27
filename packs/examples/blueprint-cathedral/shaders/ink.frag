// Ink: edges of the lit city (luminance gradient) become cyan drafting lines over a blue wash of the original image.
varying vec2 vUv;
uniform sampler2D tInput;uniform vec2 uRes;uniform float uInk,uBeat,uEnergy;
float lum(vec2 uv){vec3 c=texture2D(tInput,uv).rgb;return log(1.+dot(c,vec3(.2126,.7152,.0722)));}
void main(){
  vec2 px=1./uRes;vec3 src=texture2D(tInput,vUv).rgb;
  float tl=lum(vUv+px*vec2(-1,1)),t=lum(vUv+px*vec2(0,1)),tr=lum(vUv+px*vec2(1,1)),l=lum(vUv-px*vec2(1,0)),r=lum(vUv+px*vec2(1,0)),bl=lum(vUv-px),b=lum(vUv-px*vec2(0,1)),br=lum(vUv+px*vec2(1,-1));
  float gx=tr+2.*r+br-tl-2.*l-bl,gy=tl+2.*t+tr-bl-2.*b-br,edge=smoothstep(.04,.35,sqrt(gx*gx+gy*gy));
  vec3 wash=vec3(.25,.55,1.)*dot(src,vec3(.3,.5,.2))*.55;
  vec3 ink=vec3(.55,.95,1.4)*edge*(1.1+.25*uBeat+.3*uEnergy);
  gl_FragColor=vec4(mix(src,wash+ink,uInk)+src*.12,1.);
}

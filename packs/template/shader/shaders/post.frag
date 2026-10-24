// Post slot: a full-screen pass on the HDR scene before bloom and grade. tInput is the image so far.
varying vec2 vUv;
uniform sampler2D tInput;uniform float uTime,uWarmth;
void main(){vec3 c=texture2D(tInput,vUv).rgb;c*=mix(vec3(1.),vec3(1.08,1.,.9),uWarmth);gl_FragColor=vec4(c,1.);}

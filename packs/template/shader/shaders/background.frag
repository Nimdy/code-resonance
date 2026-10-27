// Background slot: drawn at half resolution behind the world. Available uniforms: uTime, uBeat, uBar, uEnergy,
// uActivity, uRes, uCam, uInv (inverse view-projection), the palette (uPrimary, uSecondary, uAccent, uHighlight, uDeep,
// uHaze, uWarning, uValid) and the pack's own uniforms (here uWarmth).
varying vec2 vUv;
uniform float uTime,uBeat,uWarmth;uniform vec3 uDeep,uHaze;
void main(){vec3 c=mix(uDeep,uHaze*.6,vUv.y)+vec3(.04,.02,0.)*uWarmth;gl_FragColor=vec4(c*(1.+.05*uBeat),1.);}

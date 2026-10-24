varying vec3 vCol;varying float vAlpha;
void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float a=(exp(-d*d*28.)+.35*exp(-d*d*6.))*vAlpha;gl_FragColor=vec4(vCol*a,a);}

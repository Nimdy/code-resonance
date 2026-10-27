varying vec3 vCol;varying float vAlpha;
void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float a=smoothstep(.5,.0,d)*vAlpha;gl_FragColor=vec4(vCol*a,a);}

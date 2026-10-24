varying vec2 vUv;varying vec3 vCol;varying float vAge;
void main(){float r=length(vUv);if(r>1.)discard;float band=exp(-pow((r-.92)*16.,2.))+.25*exp(-pow((r-.7)*10.,2.));
  float a=band*(1.-vAge)*smoothstep(0.,.08,vAge);gl_FragColor=vec4(vCol*a,a);}

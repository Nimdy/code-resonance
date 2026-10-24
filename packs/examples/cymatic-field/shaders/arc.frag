uniform vec3 uAccent,uGold;uniform float uT,uSpeed;
varying float vAlpha,vT,vFlash;
void main(){float travel=.5+.5*sin(vT*18.-uT/uSpeed*4.);vec3 c=uAccent*(.25+.35*travel)+uGold*vFlash*1.5;gl_FragColor=vec4(c*vAlpha,vAlpha);}

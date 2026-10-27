// Artist layers' forms: the procedural geometry of fractals, structures and flow ribbons, as plain arrays in a layer's
// own unit space (a form spans about 1). Pure (no THREE, no rendering), seeded, tested in Node
// (tests/layers-forms.test.js); layers-gl.js places and draws them.
const TAU=Math.PI*2,GOLDEN=2.39996323;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export function hash(s){let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function rng(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
const norm=v=>{const l=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const add=(a,b,k=1)=>[a[0]+b[0]*k,a[1]+b[1]*k,a[2]+b[2]*k];
// Rotate v about unit axis k by angle a (Rodrigues).
export function rotate(v,k,a){const c=Math.cos(a),s=Math.sin(a),d=k[0]*v[0]+k[1]*v[1]+k[2]*v[2],x=cross(k,v);return [v[0]*c+x[0]*s+k[0]*d*(1-c),v[1]*c+x[1]*s+k[1]*d*(1-c),v[2]*c+x[2]*s+k[2]*d*(1-c)];}
const perp=d=>norm(Math.abs(d[1])<.9?cross(d,[0,1,0]):cross(d,[1,0,0]));
// ---- Fractals ----------------------------------------------------------------------------------------------------------
// A fractal is a list of segments: [ax, ay, az, tA, bx, by, bz, tB, wA, wB, level, phase] (SEG floats each), where t is
// the path length from the root normalised to 1 at the farthest tip (growth reveals t <= growth), w the relative width,
// and tips (the free ends): [x, y, z, t, size]. Forms grow from the origin, about 1 high.
export const SEG=12,TIP=5,MAX_SEGMENTS=24000;
export const FORMS=['tree','fern','coral','lightning','spiral'];
export function fractal({form='tree',depth=5,branching=2,spread=.5,seed=1,limit=MAX_SEGMENTS}={}){
  const r=rng(seed),segs=[],tips=[];depth=Math.round(clamp(depth,1,7));branching=Math.round(clamp(branching,2,4));spread=clamp(spread);
  const seg=(a,b,wA,wB,level,len)=>{if(segs.length>=limit)return false;segs.push({a,b,wA,wB,level,len,phase:r()});return true;};
  const tip=(p,size,len)=>tips.push({p,size,len});
  // Path length from the root is accumulated as segments are made; t is normalised at the end.
  const grow={
    tree(){const go=(p,d,len,w,level,acc)=>{const b=add(p,d,len);if(!seg(p,b,w,w*.72,level,acc+len))return;
        if(level>=depth){tip(b,w,acc+len);return;}
        const roll=r()*TAU;
        for(let k=0;k<branching;k++){const ax=rotate(perp(d),d,roll+k*TAU/branching+(r()-.5)*.5),tilt=(.22+.75*spread)*(.65+.5*r())*(branching>2&&k===0?.45:1);
          let nd=rotate(d,ax,tilt);nd=norm(add(nd,[0,1,0],.12));go(b,nd,len*(.64+.16*r()),w*.72,level+1,acc+len);}};
      go([0,0,0],[0,1,0],.34,1,0,0);},
    coral(){const go=(p,d,len,w,level,acc)=>{
        // Two sub-segments per branch, slightly bent: polyp-like, organic; children fan out and rise.
        const bend=rotate(d,perp(d),(r()-.5)*.35),m=add(p,d,len*.5),b=add(m,bend,len*.5);
        if(!seg(p,m,w,w*.9,level,acc+len*.5)||!seg(m,b,w*.9,w*.8,level,acc+len))return;
        if(level>=depth){tip(b,w*1.6,acc+len);return;}
        const roll=r()*TAU,n=branching+(r()<.3?1:0);
        for(let k=0;k<n;k++){const ax=rotate(perp(bend),bend,roll+k*TAU/n),tilt=(.35+.8*spread)*(.6+.5*r());
          const nd=norm(add(rotate(bend,ax,tilt),[0,1,0],.35));go(b,nd,len*(.74+.12*r()),w*.8,level+1,acc+len);}};
      go([0,0,0],[0,1,0],.26,1.4,0,0);},
    fern(){const levels=Math.min(depth,3);
      const frond=(p,d,len,w,level,acc,curl)=>{
        const n=level===0?7+Math.max(0,depth-3)*2:5,step=len/n,side=perp(d);let q=p,dir=d,a=acc;
        for(let s=0;s<n;s++){dir=rotate(dir,side,curl);const e=add(q,dir,step*(1-s/n*.35));if(!seg(q,e,w*(1-s/n*.7),w*(1-(s+1)/n*.7),level,a+step))return;a+=step;
          if(level<levels&&s<n-1){const k=1-s/n*.7;
            for(const sgn of branching>=3?[-1,1]:[(s%2)*2-1]){const out=rotate(dir,dir,0),nd=norm(add(rotate(out,cross(dir,side),sgn*(.8+.5*spread)),[0,1,0],.15));
              frond(e,nd,len*.42*k,w*.55,level+1,a,curl*1.3);}}
          else if(s===n-1)tip(e,w*.8,a);
          q=e;}};
      frond([0,0,0],[0,1,0],1,1,0,0,-.07-.05*spread);},
    lightning(){
      // Strikes downward from above: a jagged main channel, forks that branch off and fade sooner.
      const channel=(p,d,len,w,level,acc)=>{const n=8+depth*2-level*3,step=len/n;let q=p,a=acc;
        for(let s=0;s<Math.max(3,n);s++){const j=norm(add(d,[(r()-.5),(r()-.5)*.3,(r()-.5)],.55+.6*spread)),e=add(q,j,step);
          if(!seg(q,e,w,w*.92,level,a+step))return;a+=step;
          if(level<Math.min(depth,4)-1&&r()<.12*(branching-1)+.05){const f=norm(add(d,[(r()-.5)*2,.1,(r()-.5)*2],.9));channel(e,f,len*(.35+.2*r()),w*.55,level+1,a);}
          q=e;}
        tip(q,w*.6,a);};
      channel([0,1.05,0],[0,-1,0],1.05,1.1,0,0);},
    spiral(){
      // Logarithmic arms (one per branching), each budding smaller counter-turning spirals: self-similar.
      const arm=(c,a0,scale,turn,w,level,acc)=>{const n=26+depth*6-level*8,T=TAU*(1.1+.25*depth)/(level?1.6:1),b=.16+.1*spread;let prev=null,a=acc;
        for(let s=0;s<=n;s++){const th=T*s/n,rr=scale*.05*Math.exp(b*th)/Math.exp(b*T)*20,x=c[0]+Math.cos(a0+turn*th)*rr,z=c[2]+Math.sin(a0+turn*th)*rr,y=c[1]+scale*.18*s/n,p=[x,y,z];
          if(prev){const l=Math.hypot(p[0]-prev[0],p[1]-prev[1],p[2]-prev[2]);if(!seg(prev,p,w*(.35+.65*s/n),w*(.35+.65*(s+1)/n),level,a+l))return;a+=l;
            if(level<Math.min(depth,4)-2&&s>n*.35&&s%Math.max(3,Math.round(n/(2+depth)))===0)arm(p,a0+turn*th+Math.PI,scale*.32,-turn,w*.5,level+1,a);}
          prev=p;}
        if(prev)tip(prev,w,a);};
      for(let k=0;k<branching;k++)arm([0,0,0],k*TAU/branching+r()*.2,1,1,1,0,0);}
  };
  (grow[form]||grow.tree)();
  const maxLen=Math.max(1e-6,...segs.map(s=>s.len));let height=0;for(const s of segs)height=Math.max(height,Math.abs(s.b[1]),Math.hypot(s.b[0],s.b[2]));
  const k=1/Math.max(.2,height),S=new Float32Array(segs.length*SEG),T=new Float32Array(tips.length*TIP);
  // Segments sorted by level (the deepest can be left out at low quality), positions normalised to about 1.
  const order=segs.map((s,i)=>i).sort((a,b)=>segs[a].level-segs[b].level||a-b);
  order.forEach((i,o)=>{const s=segs[i],len=Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1],s.b[2]-s.a[2]);
    S.set([s.a[0]*k,s.a[1]*k,s.a[2]*k,(s.len-len)/maxLen,s.b[0]*k,s.b[1]*k,s.b[2]*k,s.len/maxLen,s.wA,s.wB,s.level,s.phase],o*SEG);});
  tips.forEach((x,o)=>T.set([x.p[0]*k,x.p[1]*k,x.p[2]*k,x.len/maxLen,x.size],o*TIP));
  const levels=[];for(const s of segs)levels[s.level]=(levels[s.level]||0)+1;
  return {segments:S,count:segs.length,tips:T,tipCount:tips.length,levels:levels.map(x=>x||0)};
}
// ---- Structures ----------------------------------------------------------------------------------------------------------
// Lines: [ax, ay, az, bx, by, bz, group, t, width, phase] (LINE floats); groups: [{axis, rate, centre}] spin about their
// own axis; surfaces: triangles [x, y, z, nx, ny, nz, group] per vertex (VERT floats); points: [x, y, z, group, size].
// Orbit bodies: [radius, eccentricity, tiltX, tiltZ, phase, rate, size, group] (BODY floats).
export const LINE=10,VERT=7,POINT=5,BODY=8;
export const SHAPES=['rings','lattice','polyhedron','orbits','arches'];
const POLY={
  tetra:{v:[[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]],f:[[0,1,2],[0,3,1],[0,2,3],[1,3,2]]},
  cube:{v:[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],f:[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[2,3,7],[2,7,6],[1,2,6],[1,6,5],[0,4,7],[0,7,3]],quads:true},
  octa:{v:[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],f:[[0,2,4],[2,1,4],[1,3,4],[3,0,4],[2,0,5],[1,2,5],[3,1,5],[0,3,5]]},
  icosa:(()=>{const p=(1+Math.sqrt(5))/2,v=[[-1,p,0],[1,p,0],[-1,-p,0],[1,-p,0],[0,-1,p],[0,1,p],[0,-1,-p],[0,1,-p],[p,0,-1],[p,0,1],[-p,0,-1],[-p,0,1]];
    return {v,f:[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]]};})()
};
// The dodecahedron as the dual of the icosahedron (face centres), with pentagonal faces fanned into triangles.
POLY.dodeca=(()=>{const I=POLY.icosa,c=I.f.map(f=>norm(f.reduce((s,k)=>add(s,I.v[k]),[0,0,0]))),f=[];
  for(let k=0;k<I.v.length;k++){const around=I.f.map((x,i)=>x.includes(k)?i:-1).filter(i=>i>=0),n=norm(I.v[k]),u=perp(n),w=cross(n,u);
    around.sort((a,b)=>Math.atan2(c[a][0]*w[0]+c[a][1]*w[1]+c[a][2]*w[2],c[a][0]*u[0]+c[a][1]*u[1]+c[a][2]*u[2])-Math.atan2(c[b][0]*w[0]+c[b][1]*w[1]+c[b][2]*w[2],c[b][0]*u[0]+c[b][1]*u[1]+c[b][2]*u[2]));
    for(let j=1;j<around.length-1;j++)f.push([around[0],around[j],around[j+1]]);}
  return {v:c,f,fan:5};})();
function geodesic(P,freq){
  if(freq<=1)return {v:P.v.map(norm),f:P.f};
  const v=[],f=[],key=new Map(),at=p=>{const q=norm(p),k=q.map(x=>x.toFixed(5)).join();if(!key.has(k)){key.set(k,v.length);v.push(q);}return key.get(k);};
  for(const [a,b,c] of P.f){const A=norm(P.v[a]),B=norm(P.v[b]),C=norm(P.v[c]);
    // Barycentric grid over the face: point (i, j) = A + (B - A) i/f + (C - A) j/f, pushed out to the sphere.
    const pt=(i,j)=>at([0,1,2].map(n=>A[n]+(B[n]-A[n])*i/freq+(C[n]-A[n])*j/freq));
    for(let i=0;i<freq;i++)for(let j=0;j<freq-i;j++){f.push([pt(i,j),pt(i+1,j),pt(i,j+1)]);if(i+j<freq-1)f.push([pt(i+1,j),pt(i+1,j+1),pt(i,j+1)]);}}
  return {v,f};
}
// The edges of a solid: every triangle edge except the diagonals inside a flat polygon (cube quads, pentagons).
function edgesOf(P){
  const faces=new Map(),key=(a,b)=>a<b?`${a}|${b}`:`${b}|${a}`;
  for(const f of P.f)for(const [a,b] of [[f[0],f[1]],[f[1],f[2]],[f[2],f[0]]]){const k=key(a,b);if(!faces.has(k))faces.set(k,{a,b,f:[]});faces.get(k).f.push(f);}
  const normal=f=>norm(cross(add(P.v[f[1]],P.v[f[0]],-1),add(P.v[f[2]],P.v[f[0]],-1)));
  const out=[];for(const {a,b,f} of faces.values()){if(f.length===2){const x=normal(f[0]),y=normal(f[1]);if(x[0]*y[0]+x[1]*y[1]+x[2]*y[2]>.999)continue;}out.push([a,b]);}
  return out;}
const comb=(u,w,a)=>[u[0]*Math.cos(a)+w[0]*Math.sin(a),u[1]*Math.cos(a)+w[1]*Math.sin(a),u[2]*Math.cos(a)+w[2]*Math.sin(a)];
export function structure({shape='rings',count=4,detail=3,thickness=.5,seed=1}={}){
  const r=rng(seed),lines=[],tris=[],points=[],bodies=[],groups=[];detail=Math.round(clamp(detail,1,5));count=Math.round(clamp(count,1,24));
  const line=(a,b,g,t,w=1,ph=r())=>lines.push(a[0],a[1],a[2],b[0],b[1],b[2],g,t,w,ph);
  const tri=(a,b,c,g,n=null)=>{const nn=n||norm(cross(add(b,a,-1),add(c,a,-1)));for(const p of [a,b,c])tris.push(p[0],p[1],p[2],nn[0],nn[1],nn[2],g);};
  const point=(p,g,s=1)=>points.push(p[0],p[1],p[2],g,s);
  const group=(axis,rate,centre=[0,0,0])=>{groups.push({axis:norm(axis),rate,centre});return groups.length-1;};
  // A tube along a closed or open polyline (surfaces), radius rad, around group g.
  // Frames are parallel-transported along the path (no twist where the path turns).
  const tube=(path,g,rad,closed=true,sides=8)=>{const n=path.length,dirs=path.map((p,i)=>norm(i===0&&!closed?add(path[1],p,-1):i===n-1&&!closed?add(p,path[n-2],-1):add(path[(i+1)%n],path[(i-1+n)%n],-1)));
    let u=perp(dirs[0]);const frames=dirs.map(d=>{const w0=cross(d,u);u=norm(cross(w0,d));return {u,w:norm(cross(d,u))};});
    const rings=path.map((p,i)=>Array.from({length:sides},(_,s)=>{const o=comb(frames[i].u,frames[i].w,s/sides*TAU);return {p:add(p,o,rad),n:o};}));
    for(let i=0;i<(closed?n:n-1);i++){const A=rings[i],B=rings[(i+1)%n];for(let s=0;s<sides;s++){const s2=(s+1)%sides;
      for(const q of [A[s],B[s],B[s2],A[s],B[s2],A[s2]])tris.push(q.p[0],q.p[1],q.p[2],q.n[0],q.n[1],q.n[2],g);}}};
  const circle=(c,u,w,rad,n)=>Array.from({length:n},(_,i)=>add(c,comb(u,w,i/n*TAU),rad));
  const tubeR=.006+.014*thickness;
  if(shape==='rings'){
    // An armillary: rings of growing radius, each tilted and tumbling about one of its own diameters (a gimbal).
    for(let i=0;i<count;i++){const rad=.38+.62*(i+1)/count,tilt=i===0?0:(.35+.9*r())*(i%2?1:-1),yaw=r()*TAU,n=rotate([0,1,0],[Math.cos(yaw),0,Math.sin(yaw)],tilt),u=perp(n),w=cross(n,u);
      const g=group(rotate(u,n,r()*TAU),(.05+.18*r())*(i%2?1:-1)*(1-.5*i/count)),N=48+24*detail,pts=circle([0,0,0],u,w,rad,N);
      for(let k=0;k<N;k++)line(pts[k],pts[(k+1)%N],g,k/N,1);
      // Graduations (an astrolabe's), an inner echo, beads at the hours: they also make each ring's turning visible.
      if(detail>=3){const M=detail>=4?72:36;for(let k=0;k<M;k++){const dir=comb(u,w,k/M*TAU),L=k%(M/12)===0?.07:.03;line(add([0,0,0],dir,rad),add([0,0,0],dir,rad-L),g,k/M,.6);}}
      if(detail>=4){const p2=circle([0,0,0],u,w,rad*.955,N);for(let k=0;k<N;k+=2)line(p2[k],p2[(k+1)%N],g,k/N,.45);}
      if(detail>=5)for(let k=0;k<12;k++)point(add([0,0,0],comb(u,w,k/12*TAU),rad),g,1.4);
      tube(pts.filter((_,k)=>k%Math.max(1,Math.round(N/96))===0),g,tubeR,true,6+detail);}
  }else if(shape==='lattice'){
    // A crystal: a cubic lattice clipped to a sphere; trusses (face diagonals) and nodes at the joints.
    const m=Math.round(clamp(count,2,7)),h=1.5/m,g=group([.3,1,.2],.06),idx=new Map(),nodes=[];
    for(let i=0;i<=m;i++)for(let j=0;j<=m;j++)for(let k=0;k<=m;k++){const p=[-.75+i*h,-.75+j*h,-.75+k*h];if(Math.hypot(...p)>.98)continue;idx.set(`${i},${j},${k}`,nodes.length);nodes.push({p,i,j,k});}
    const at=(i,j,k)=>idx.get(`${i},${j},${k}`);
    for(const n of nodes){point(n.p,g,1);
      for(const [di,dj,dk,w] of [[1,0,0,1],[0,1,0,1],[0,0,1,1],...(detail>=3?[[1,0,1,.55],[1,1,0,.55]]:[]),...(detail>=5?[[1,1,1,.4]]:[])]){
        if(w<1&&(n.i+n.j+n.k)%2)continue;const o=at(n.i+di,n.j+dj,n.k+dk);if(o===undefined)continue;line(n.p,nodes[o].p,g,r(),w);}
      if(detail>=2){const s=.025+.02*thickness;const P=POLY.octa;for(const f of P.f)tri(...f.map(v=>add(n.p,P.v[v],s)),g);}}
  }else if(shape==='polyhedron'){
    // Nested solids, each turning about its own axis: icosahedron (geodesic with detail), dodecahedron, octahedron …
    const cycle=['icosa','dodeca','octa','cube','tetra'],shells=Math.round(clamp(count,1,6));
    for(let s=0;s<shells;s++){const name=cycle[s%cycle.length],rad=.95*(1-s*.14),freq=name==='icosa'?Math.max(1,Math.min(3,detail-1)):1,P=name==='icosa'?geodesic(POLY.icosa,freq):{...POLY[name],v:POLY[name].v.map(norm)};
      const g=group([r()-.5,1,r()-.5],(.08+.12*r())*(s%2?-1:1));const V=P.v.map(v=>[v[0]*rad,v[1]*rad,v[2]*rad]);
      for(const [a,b] of edgesOf({...P,v:V}))line(V[a],V[b],g,r(),1);
      for(const v of V)point(v,g,.8);
      for(const f of P.f)tri(V[f[0]],V[f[1]],V[f[2]],g);}
  }else if(shape==='orbits'){
    // An orrery: tilted ellipses (faint paths) with bodies moving along them, faster near the centre.
    const g=group([0,1,0],0);const n=Math.min(count,16);
    for(let i=0;i<n;i++){const rad=.22+.78*(i+1)/n,e=.05+.25*r(),tx=(r()-.5)*.7,tz=(r()-.5)*.5,N=96;
      const pts=Array.from({length:N},(_,k)=>{const a=k/N*TAU,x=Math.cos(a)*rad,z=Math.sin(a)*rad*(1-e);const p=rotate(rotate([x,0,z],[1,0,0],tx),[0,0,1],tz);return p;});
      for(let k=0;k<N;k++)line(pts[k],pts[(k+1)%N],g,k/N,.55);
      const b=Math.round(clamp(detail,1,5));for(let j=0;j<b;j++)bodies.push(rad,e,tx,tz,j/b*TAU+r()*.4,.9/Math.pow(rad,1.5),.6+.8*r(),g);
      tube(pts.filter((_,k)=>k%3===0),g,tubeR*.6,true,6);}
  }else{
    // Arches around a circle, facing its centre: pointed arcs on posts; tracery and an oculus with detail.
    const n=count,g=group([0,1,0],.03),R0=n===1?0:.85,span=n===1?.9:Math.min(.75,TAU*R0/n*.62),H=Math.min(1.15,span*1.7),spring=H*.55,N=6+4*detail;
    // A pointed arch in its own plane (x along u, y up): posts to the springing line, then two arcs meeting at the apex.
    // Each arc's centre sits on the springing line, so a rise r over a half-span h needs the radius (r^2 + h^2) / 2h.
    const arch=(c,u,half,base,top,rise,width,t0)=>{rise=Math.max(rise,half);const rad=(rise*rise+half*half)/(2*half),cx=-half+rad,th=Math.acos(clamp(-cx/rad,-1,1));
      const L=[[-half,base],[-half,top]];for(let k=1;k<=N;k++){const a=Math.PI+(th-Math.PI)*k/N;L.push([cx+rad*Math.cos(a),top+rad*Math.sin(a)]);}
      const pts=[...L,...L.slice(0,-1).reverse().map(([x,y])=>[-x,y])].map(([x,y])=>[c[0]+u[0]*x,y,c[2]+u[2]*x]);
      for(let k=0;k<pts.length-1;k++)line(pts[k],pts[k+1],g,t0+k/pts.length*.5,width);
      return pts;};
    for(let i=0;i<n;i++){const a=i/n*TAU,c=[Math.cos(a)*R0,0,Math.sin(a)*R0],u=n===1?[1,0,0]:[-Math.sin(a),0,Math.cos(a)],half=span/2;
      const outer=arch(c,u,half,0,spring,H-spring,1,i/n);
      if(detail>=3)arch(c,u,half*.6,spring*.45,spring*.95,(H-spring)*.62,.5,i/n);
      if(detail>=4){const pts=circle([c[0],spring+(H-spring)*.62,c[2]],u,[0,1,0],half*.2,24);for(let k=0;k<24;k++)line(pts[k],pts[(k+1)%24],g,k/24,.5);}
      if(detail>=5)line([c[0],spring*.45,c[2]],[c[0],spring*.95+(H-spring)*.62*.98,c[2]],g,.5,.45);
      point([c[0],H,c[2]],g,1.2);
      tube(outer,g,tubeR,false,6);}
  }
  return {lines:new Float32Array(lines),lineCount:lines.length/LINE,surfaces:new Float32Array(tris),vertexCount:tris.length/VERT,points:new Float32Array(points),pointCount:points.length/POINT,
    bodies:new Float32Array(bodies),bodyCount:bodies.length/BODY,groups};
}
// ---- Flow fields (ribbons) -------------------------------------------------------------------------------------------
// A ribbon is a streamline of a slowly changing field around its site, integrated from a seed that drifts; its shape
// is a pure function of time, so it needs no state and no warm start. Coordinates are relative to the site, in units
// of its radius. field(out, x, y, z, t, ctx) writes the flow direction (unnormalised).
export const FIELDS=['curl','orbit','spiral','wind'];
function curl(out,x,y,z,t,ph,turb){
  // F = curl(Psi), Psi = (sin(a.p + .), sin(b.p + .), sin(c.p + .)): divergence-free, swirling; a finer octave adds
  // turbulence.
  const c1=Math.cos(1.3*y+.7*z+ph[0]+t*.21),c2=Math.cos(1.1*z+.9*x+ph[1]-t*.17),c3=Math.cos(1.2*x+.8*y+ph[2]+t*.19);
  out[0]=.8*c3-1.1*c2;out[1]=.7*c1-1.2*c3;out[2]=.9*c2-1.3*c1;
  if(turb>0){const d1=Math.cos(3.1*y+2.3*z+ph[1]+t*.43),d2=Math.cos(2.9*z+3.3*x+ph[2]-t*.37),d3=Math.cos(3.4*x+2.6*y+ph[0]+t*.41),k=turb*.55;
    out[0]+=k*(2.6*d3-2.9*d2);out[1]+=k*(2.3*d1-3.4*d3);out[2]+=k*(3.3*d2-3.1*d1);}
  return out;
}
const tmp=[0,0,0];
export const FIELD={
  curl(out,x,y,z,t,c){curl(out,x*1.4,y*1.4,z*1.4,t,c.ph,c.turb);const d=Math.hypot(x,y,z);if(d>1.25){const k=(d-1.25)*2.5;out[0]-=x/d*k;out[1]-=y/d*k;out[2]-=z/d*k;}return out;},
  orbit(out,x,y,z,t,c){const k=c.axis,along=x*k[0]+y*k[1]+z*k[2],rx=x-k[0]*along,ry=y-k[1]*along,rz=z-k[2]*along,rr=Math.hypot(rx,ry,rz)+1e-6;
    out[0]=k[1]*rz-k[2]*ry;out[1]=k[2]*rx-k[0]*rz;out[2]=k[0]*ry-k[1]*rx;const tl=Math.hypot(out[0],out[1],out[2])+1e-6;out[0]/=tl;out[1]/=tl;out[2]/=tl;
    const pull=(c.band-rr)*1.6;out[0]+=rx/rr*pull-k[0]*along*1.4;out[1]+=ry/rr*pull-k[1]*along*1.4;out[2]+=rz/rr*pull-k[2]*along*1.4;
    if(c.turb>0){curl(tmp,x*2,y*2,z*2,t,c.ph,0);out[0]+=tmp[0]*c.turb*.3;out[1]+=tmp[1]*c.turb*.3;out[2]+=tmp[2]*c.turb*.3;}return out;},
  spiral(out,x,y,z,t,c){const rr=Math.hypot(x,z)+1e-6;out[0]=-z/rr-x/rr*.42;out[2]=x/rr-z/rr*.42;out[1]=-y*.6+.12*Math.sin(rr*4-t*.3+c.ph[0]);
    if(c.turb>0){curl(tmp,x*2.2,y*2.2,z*2.2,t,c.ph,0);out[0]+=tmp[0]*c.turb*.25;out[1]+=tmp[1]*c.turb*.12;out[2]+=tmp[2]*c.turb*.25;}return out;},
  wind(out,x,y,z,t,c){const w=c.wind;curl(tmp,x*1.6,y*1.6,z*1.6,t,c.ph,0);const k=.25+.6*c.turb;out[0]=w[0]+tmp[0]*k;out[1]=tmp[1]*k*.45-y*.5;out[2]=w[2]+tmp[2]*k;return out;}
};
// Per-ribbon constants (seeded): its seed point's home, drift phases, its orbit axis and band, the wind direction.
export function ribbonSeeds(seed,count,field){
  // One field for the whole layer (its phases from a stream of their own): the ribbons are streamlines of the same
  // currents, so neighbours flow together instead of each following a private field.
  const r=rng(seed),wy=r()*TAU,out=[],f=rng((seed^0x5bd1e995)>>>0),fph=[f()*TAU,f()*TAU,f()*TAU];
  for(let j=0;j<count;j++){const a=r()*TAU,u=r(),v=r(),ph=[r()*TAU,r()*TAU,r()*TAU],tilt=(r()-.5)*1.1,yaw=r()*TAU;
    const axis=rotate([0,1,0],[Math.cos(yaw),0,Math.sin(yaw)],tilt),band=.45+.55*r();let home;
    if(field==='orbit'){const p=perp(axis),q=rotate(p,axis,a);home=[q[0]*band,q[1]*band,q[2]*band];}
    else if(field==='spiral'){home=[Math.cos(a)*(1+.2*u),(v-.5)*.25,Math.sin(a)*(1+.2*u)];}
    else if(field==='wind'){const s=(u-.5)*2,h=(v-.5)*.9;home=[-Math.cos(wy)*1.1-Math.sin(wy)*s,h,-Math.sin(wy)*1.1+Math.cos(wy)*s];}
    else{const d=Math.cbrt(u)*.9,ph2=Math.acos(2*v-1);home=[Math.sin(ph2)*Math.cos(a)*d,Math.cos(ph2)*d*.7,Math.sin(ph2)*Math.sin(a)*d];}
    out.push({home,ph,fph,axis,band,wind:[Math.cos(wy),0,Math.sin(wy)],drift:r()*TAU,hue:r()});}
  return out;
}
// Integrates ribbon j's streamline at time t into out (M points, xyz). length: its arc length in site radii.
export function streamline(out,M,rib,field,{t=0,length=1,turbulence=.4}={}){
  const F=FIELD[field]||FIELD.curl,c={ph:rib.fph||rib.ph,axis:rib.axis,band:rib.band,wind:rib.wind,turb:turbulence},v=[0,0,0];
  // The seed drifts slowly about its home (the ribbon sways and wanders, never jumps).
  let x=rib.home[0]+.12*Math.sin(t*.13+rib.drift),y=rib.home[1]+.08*Math.sin(t*.11+rib.drift*2),z=rib.home[2]+.12*Math.cos(t*.09+rib.drift);
  const h=length*2.4/(M-1);let px=0,py=0,pz=0;
  for(let k=0;k<M;k++){out[k*3]=x;out[k*3+1]=y;out[k*3+2]=z;
    F(v,x,y,z,t,c);let l=Math.hypot(v[0],v[1],v[2])||1,dx=v[0]/l,dy=v[1]/l,dz=v[2]/l;
    // Direction smoothed with the previous step (a midpoint-like correction at the cost of one field sample).
    if(k){dx=dx+px;dy=dy+py;dz=dz+pz;l=Math.hypot(dx,dy,dz)||1;dx/=l;dy/=l;dz/=l;}px=dx;py=dy;pz=dz;
    x+=dx*h;y+=dy*h;z+=dz*h;}
  return out;
}

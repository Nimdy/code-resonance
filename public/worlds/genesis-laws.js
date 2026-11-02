// Genesis (preview): the Lawbook and the growth law, pure (no THREE, no rendering): tests/genesis.test.js pins them.
// Design brief: docs/worlds/genesis.md.
//
// The Lawbook is the recipe's genome.laws, ten laws in 0..1 drawn from the project's traits with a seeded share
// (engine/recipe.js GENOMES.genesis). Everything the world does follows from them through lawbook() below, so tuning a law
// changes how the universe behaves, not only how it looks. Each is an artistic abstraction of an observed trait, never a
// claim about what the code does when it runs:
//  - morphogenesis -> growth: how much larger each new chamber is than the one before (the whole coil's expansion)
//  - cohesion      -> how tightly the chambers embrace: their size against the coil, how few to a whorl
//  - anisotropy    -> the direction of growth: a flat coil (0) or a rising cone (1)
//  - coupling      -> the openings in the walls between coupled chambers, and how much resonance leaks through them
//  - conductivity  -> porosity (how many pores open, how wide) and the speed of the light along the threads
//  - elasticity    -> the frequency of a chamber's ring and how fast matter returns to rest
//  - viscosity     -> how fast excitations and currents die away
//  - resonance     -> the chambers' mode orders (finer standing waves) and how strongly they answer the music
//  - stability     -> how deep a disturbance cuts (a failure's crazing, a decoherence's flicker)
//  - dispersion    -> how waves split and spread (trains of light on the threads, resonance reaching neighbours)
// The growth law places the k-th chamber (subsystems in order of birth) on a logarithmic coil from its rank alone, so a
// new chamber never moves an older one; a chamber's size within its slot follows its live files.
export const LAWS=['cohesion','coupling','elasticity','conductivity','anisotropy','resonance','viscosity','morphogenesis','stability','dispersion'];
export const MAXC=48;
const TAU=Math.PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const num=(v,d)=>typeof v==='number'&&Number.isFinite(v)?v:d;
export function hash(s){let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function rand(seed){let t=(seed>>>0)+0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
// The material languages: the body's base colour (linear), how glossy and rough its glaze, how much light passes the wall,
// the play of colour (opal), the sutures' metal, the interior's nacre, the subsurface tint near the terminator. The
// palette tints the body and sets the metal's and the inner light's colour; these set the character.
export const MATERIALS={
  porcelain:{body:[.80,.75,.66],glaze:.85,rough:.16,translucency:.8,opal:.3,metal:[.93,.78,.52],interior:[.92,.82,.70],sss:[1,.58,.38],grain:.5},
  celadon:{body:[.46,.56,.49],glaze:.9,rough:.12,translucency:.65,opal:.2,metal:[.86,.80,.66],interior:[.70,.80,.72],sss:[.62,.9,.7],grain:.35},
  smoke:{body:[.13,.12,.115],glaze:.97,rough:.06,translucency:1.45,opal:.16,metal:[.83,.85,.9],interior:[.48,.44,.40],sss:[1,.7,.45],grain:.15},
  onyx:{body:[.028,.026,.025],glaze:.92,rough:.1,translucency:.22,opal:.45,metal:[.98,.76,.36],interior:[.32,.26,.2],sss:[1,.6,.3],grain:.25}
};
// Resonant degrees by birth rank: tonic, fifth, third, sixth, fourth, second, seventh (the first chambers answer the
// chord's roots, later ones its colours).
export const DEGREES=[0,4,2,5,3,1,6];
export const degreeOf=k=>DEGREES[((k%7)+7)%7];
// The Lawbook of a recipe: its laws (clamped, defaults 0.5) and the physics derived from them.
export function lawbook(recipe){
  const G=recipe?.genome||{},L=G.laws||{},M=G.material||{},t=recipe?.traits||{};
  const laws={};for(const k of LAWS)laws[k]=clamp(num(L[k],.5));
  const seed=(recipe?.projectSeed>>>0)||1;
  // ---- growth: chambers per whorl from cohesion, the coil's expansion over the expected chambers from morphogenesis
  // (the expected count is the subsystems at generation, so the coil is laid out for the project it was founded on)
  const nRef=Math.max(5,Math.round(num(t.districts,4)*1.25+1));
  const perWhorl=lerp(8.6,5.4,laws.cohesion),dTheta=TAU/perWhorl;
  const expansion=lerp(2.2,6.5,laws.morphogenesis);
  const tau=laws.anisotropy*.95,sense=rand(hash(`${seed}/sense`))<.5?1:-1;
  const book={laws,seed,nRef,perWhorl,dTheta,expansion,tau,sense,Rlast:60,
    tilt:.42+.4*rand(hash(`${seed}/tilt`)),yaw:rand(hash(`${seed}/yaw`))*TAU,
    // ---- resonance and ring: a ring's visual frequency (Hz) from elasticity, decays (s) from viscosity
    ring:{freq:lerp(.55,2.1,laws.elasticity),settle:lerp(.6,2.4,1-laws.elasticity),bass:lerp(3.4,1.3,laws.viscosity),melody:lerp(2,.7,laws.viscosity),
      counter:lerp(2.6,1,laws.viscosity),gain:lerp(.65,1.35,laws.resonance),lmin:1+Math.round(laws.resonance*1.4),lmax:3+Math.round(laws.resonance*3)},
    // ---- coupling: the opening between coupled chambers (a share of their wall) and the resonance that leaks through
    coupling:{opening:lerp(.12,.42,laws.coupling),leak:lerp(.08,.55,laws.coupling),delay:lerp(.42,.12,laws.conductivity)},
    // ---- porosity: the share of the wall's lattice open at the start and per symbol, and a pore's width (of its spacing)
    pores:{size:lerp(.12,.62,laws.conductivity)*clamp(num(M.pores,1),0,1.6)},
    // ---- the threads' light: speed (world units a second) and how it breaks into trains
    flow:{speed:lerp(9,34,laws.conductivity)*clamp(num(G.motion?.flow,1),0,1.6),train:lerp(.15,.85,laws.dispersion),spread:lerp(.05,.4,laws.dispersion)},
    stability:{crack:lerp(1,.45,laws.stability),flicker:lerp(1,.4,laws.stability)},cell:lerp(3,1.8,laws.resonance),
    viscosity:laws.viscosity,dispersion:laws.dispersion
  };
  // Chamber size against the coil: the smallest overlap that still joins consecutive chambers at their smallest, raised
  // by cohesion (they embrace more).
  const k=Math.max(1,Math.floor(nRef/2)),a=slotOf({...book,kappa:1},k),b=slotOf({...book,kappa:1},k-1);
  const gap=Math.hypot(a.c[0]-b.c[0],a.c[1]-b.c[1],a.c[2]-b.c[2]);
  book.kappa=gap/(SIZE_MIN*.9*(a.R+b.R))*lerp(1.02,1.22,laws.cohesion);
  book.material=materialOf(recipe);
  // ---- the stretch from law space to the world: along the coil's axis by `flatten` (a flat coil is a disc of lentil-
  // shaped chambers, a rising cone keeps them round). One symmetric matrix for the whole structure, so a radical plane
  // stays a plane and the union of balls stays exact in law space (the shaders test there and shade in the world).
  book.flatten=1-.42*(1-laws.anisotropy)*(.5+.5*laws.cohesion);
  const ax=axisOf(book),f=book.flatten,S=[0,0,0,0,0,0,0,0,0],Si=[0,0,0,0,0,0,0,0,0];
  for(let r=0;r<3;r++)for(let c=0;c<3;c++){const id=r===c?1:0;S[r*3+c]=id+(f-1)*ax[r]*ax[c];Si[r*3+c]=id+(1/f-1)*ax[r]*ax[c];}
  book.S=S;book.Si=Si;
  return book;
}
// Law space -> the world (row-major 3 x 3), and a direction's normal back (the inverse, normalised).
export const toWorld=(book,p,out=[0,0,0])=>{const S=book.S,x=p[0],y=p[1],z=p[2];out[0]=S[0]*x+S[1]*y+S[2]*z;out[1]=S[3]*x+S[4]*y+S[5]*z;out[2]=S[6]*x+S[7]*y+S[8]*z;return out;};
export const normalToWorld=(book,n,out=[0,0,0])=>{const S=book.Si,x=n[0],y=n[1],z=n[2];out[0]=S[0]*x+S[1]*y+S[2]*z;out[1]=S[3]*x+S[4]*y+S[5]*z;out[2]=S[6]*x+S[7]*y+S[8]*z;const l=Math.hypot(...out)||1;out[0]/=l;out[1]/=l;out[2]/=l;return out;};
// The regional laws: a subsystem's role (model.js roleOf) shapes its own wall within the global laws: its cells' size,
// the weight of its ridges, the share of glazed windows, how many spines it raises (services reach outward, tests are
// ribbed and orderly, the core is broad and calm, model code is fine-grained).
export const REGIONS={core:{cell:1.3,ridge:1.25,windows:.7,spines:.6},interface:{cell:.92,ridge:.85,windows:1.35,spines:.9},services:{cell:1.08,ridge:1,windows:.9,spines:1.6},
  model:{cell:.74,ridge:.9,windows:.85,spines:.8},logic:{cell:1,ridge:1,windows:1,spines:1},tests:{cell:.86,ridge:1.7,windows:.6,spines:.7}};
export const regionOf=role=>REGIONS[role]||REGIONS.logic;
// The pore lattice's rotation in a chamber (the shader's latticeRot): law-space direction -> lattice frame.
export function latticeRot(seed){const sd=seed*Math.PI*2,c1=Math.cos(sd),s1=Math.sin(sd),c2=Math.cos(sd*1.7),s2=Math.sin(sd*1.7);
  // GLSL mat3 columns: A=(c1,0,-s1 | 0,1,0 | s1,0,c1) (column-major), B=(1,0,0 | 0,c2,s2 | 0,-s2,c2); M=A*B, row-major here
  const A=[[c1,0,s1],[0,1,0],[-s1,0,c1]],B=[[1,0,0],[0,c2,-s2],[0,s2,c2]],M=[[0,0,0],[0,0,0],[0,0,0]];
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)M[i][j]+=A[i][k]*B[k][j];return M;}
// The i-th of n spherical Fibonacci points (the shader's sfPoint).
export function sfPoint(i,n){const PHI=1.61803398875,ph=2*Math.PI*((i*(PHI-1))%1),cz=1-1/n-2*i/n,sz=Math.sqrt(Math.max(0,1-cz*cz));return [Math.cos(ph)*sz,Math.sin(ph)*sz,cz];}
// The share a chamber's size takes from its live files: from SIZE_MIN of its slot (one file) to SIZE_MIN + SIZE_SPAN (64).
export const SIZE_MIN=.82,SIZE_SPAN=.36;
export const sizeOf=n=>SIZE_MIN+SIZE_SPAN*clamp(Math.log2(1+Math.max(0,n))/6);
// The k-th chamber's slot: its centre on the coil and its reference radius (R: the coil's radius there). Pure in k: the
// coil grows exponentially over the expected chambers, then more slowly (a project that outgrows its founding keeps
// growing, never explodes).
export function slotOf(book,k){
  const x=k/Math.max(1,book.nRef-1),S=x<=1?x:1+Math.log(x)*.6;
  const R=book.Rlast*Math.exp(Math.log(book.expansion)*(S-1)),th=book.sense*k*book.dTheta;
  // the coil: radius R about the axis (y), rising along it with anisotropy (a cone), then tilted and turned for the view
  const p=[R*Math.cos(th),-book.tau*(R-book.Rlast/book.expansion)*1.15,R*Math.sin(th)];
  return {c:orient(book,p),R,rho:R*(book.kappa??.6),theta:th};
}
// The coil's frame in the world: tilted toward the viewer, turned by the identity.
function orient(book,p){const ct=Math.cos(book.tilt),st=Math.sin(book.tilt),cy=Math.cos(book.yaw),sy=Math.sin(book.yaw);
  const y=p[1]*ct-p[2]*st,z=p[1]*st+p[2]*ct;return [p[0]*cy+z*sy,y,-p[0]*sy+z*cy];}
// The coil's axis in the world (the camera looks at the coil obliquely along it).
export const axisOf=book=>orient(book,[0,1,0]);
// A chamber's wall lattice: cells of one size in the world (finer with the resonance law), counted from its slot's
// radius so the pattern never reshuffles as the chamber grows (at most 6000: float precision in the shader).
export const latticeOf=(book,slot,cell=1)=>Math.round(Math.min(6000,Math.max(24,4*Math.PI*(slot.rho*1.05)**2/(book.cell*cell)**2)));
// Where the next chamber will bud from the k-th (its aperture): the direction toward slot k + 1.
export function apertureOf(book,k){const a=slotOf(book,k).c,b=slotOf(book,k+1).c,d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],l=Math.hypot(...d)||1;return [d[0]/l,d[1]/l,d[2]/l];}
// A file's place in its chamber from its rank there (unit ball, the chamber's own frame): the first at the centre, then
// a golden spiral through the shells between 0.3 and 0.78 of the radius. Never moves as files arrive.
export function seedOf(j){
  if(j<=0)return [0,0,0];
  const z=1-2*((.5+j*.6180339887)%1),a=j*2.399963229728653,s=Math.sqrt(Math.max(0,1-z*z)),r=.3+.48*Math.sqrt((.3+j*.7548776662)%1);
  return [s*Math.cos(a)*r,z*r,s*Math.sin(a)*r];
}
// The material of a recipe: its language with the identity's glaze, translucency, opal and pores over it.
export function materialOf(recipe){
  const M=recipe?.genome?.material||{},base=MATERIALS[M.kind]||MATERIALS.porcelain;
  return {kind:MATERIALS[M.kind]?M.kind:'porcelain',...base,glaze:base.glaze*(.6+.45*clamp(num(M.glaze,.85))),translucency:base.translucency*clamp(num(M.translucency,1),0,1.6),
    opal:base.opal*clamp(num(M.opal,.8),0,1.6)*1.6};
}
// Pitch class -> scale degree (the nearest degree of the key: a chromatic note answers its neighbour).
export function degreeOfMidi(midi,key){
  if(!key)return null;const pc=((Math.round(midi)-key.tonic)%12+12)%12;let best=0,bd=99;
  for(let d=0;d<7;d++){const x=Math.abs(key.scale[d]-pc),dd=Math.min(x,12-x);if(dd<bd){bd=dd;best=d;}}return best;
}

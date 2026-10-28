// Monolith: the project drawn flat, as an architectural elevation of its site plan (Canvas 2D, no WebGL). The lightweight
// stage, and the one a machine without WebGL falls back to.
//
// Everything comes from the public graph (salted ids, roles, counts, states; never a name or a path):
//  - every file is a tower on its persisted plot (engine/layout.js: the Construct's site plan, seen from the front). Plots
//    never move, so the skyline grows and never reshuffles; rows further back stand a little higher, in the haze;
//  - storeys are the file's symbols (up to 16; a mast above says there are more); a file without symbols is a plinth;
//  - a district (subsystem) has one colour of the project's palette; test files are open frames;
//  - draft = outlined, committed = solid, validated = lit windows, stressed = the warning colour, where the data says so;
//  - dependencies hang below the ground line as arcs (brighter between districts);
//  - an edited file's windows warm and a light climbs it; an agent's mark stands over the file it works on; a commit or a
//    verified moment sweeps the ground line, a failure reddens it.
// Text: the public title (or the generic one), counts, and each district's alias or generated name with its role
// (public/worlds/labels.js).
// A frame is a function of the graph, the recipe and the performance clock; an unchanged frame is a copy of the last one.
import {roleOf} from './model.js';
import {publicTitle,GENERIC_TITLE,generatedName} from './labels.js';

const SQRT3=Math.sqrt(3),WIDTH=1.06,PLINTH=.42,STOREY=.34,CAP=16,RISE=.2,MAX_ARCS=280;
const DEFAULT={primary:'#5b8def',secondary:'#45c4ae',accent:'#f0a35e',highlight:'#e8eef8',deep:'#070a12',haze:'#17223a',warning:'#ef5139',valid:'#e8d37d'};
const AGENT_COLORS=['#ff9ee8','#ffd27a','#9dffcf','#a7b8ff','#ffb08a','#8ef0ff','#e2a6ff','#c9ff8a'];
// The music's section warms or cools the haze a little.
const SECTION_TINT={home:[104,233,255],away:[170,140,255],tension:[255,150,120],resolve:[140,255,200],lift:[255,220,140],breath:[90,140,230]};
const FONT='Inter, "Segoe UI", system-ui, sans-serif';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const ease=x=>1-Math.pow(1-clamp(x),3);
const rgb=hex=>{const n=parseInt(hex.slice(1),16);return [n>>16&255,n>>8&255,n&255];};
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const calm=(c,t)=>{const l=.3*c[0]+.59*c[1]+.11*c[2];return mix(c,[l,l,l],t);};
const css=(c,a=1)=>`rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+a.toFixed(3)})`;
const symbols=c=>{let n=0;for(const k in c||{})if(c[k]>0)n+=c[k];return n;};
const heightOf=storeys=>PLINTH+STOREY*Math.min(CAP,storeys);
const mastOf=storeys=>storeys>CAP?.42*Math.log2(storeys/CAP+1):0;
export function paletteOf(recipe){
  const p=recipe?.genome?.palette||recipe?.palette||{},out={};
  for(const k of Object.keys(DEFAULT))out[k]=rgb(typeof p[k]==='string'&&/^#[0-9a-f]{6}$/i.test(p[k])?p[k]:DEFAULT[k]);
  return out;
}
// The files standing at a performance time, back row first: where each stands, its storeys, and how far it has grown in
// (births rise, a change of symbols grows or shrinks the tower, a removal fades). Durations are in viewer time (`speed`).
// `still` (reduced motion): nothing rises or grows, a new file fades in.
export function towers(nodes,now,{speed=1,still=false}={}){
  const out=[];
  for(const n of nodes.values()){
    if(n.type!=='module'||!(n.born<=now))continue;
    const age=(now-n.born)/speed,gone=n.dying==null?0:Math.max(0,now-n.dying)/speed;
    const alpha=(still?clamp(age/400):1)*clamp(1-gone/1500);if(alpha<=0)continue;
    let storeys=symbols(n.counts);
    if(!still&&n.countsAt!==undefined){const k=ease((now-n.countsAt)/speed/900),was=symbols(n.countsWas);if(k<1)storeys=was+(storeys-was)*k;}
    const q=Number.isFinite(n.q)?n.q:0,r=Number.isFinite(n.r)?n.r:0;
    out.push({id:n.id,x:SQRT3*q+SQRT3/2*r,z:1.5*r,symbols:symbols(n.counts),storeys,grow:still?1:ease(age/1200),alpha,group:n.group,state:n.state,test:!!n.test,litAt:n.litAt});
  }
  return out.sort((a,b)=>a.z-b.z||a.x-b.x);
}
// The text a frame may carry: the public title (or the generic one), counts, and the districts: alias (or generated name)
// and role.
export function captions(list,{groups=new Map(),recipe=null,links=0}={}){
  const per=new Map();for(const t of list)per.set(t.group,(per.get(t.group)||0)+1);
  const districts=[...per].map(([id,files])=>{const g=groups.get(id)||{};const alias=recipe?.aliases?.[id];
    return {id,order:Number.isFinite(g.order)?g.order:1e6,files,name:typeof alias==='string'&&alias.trim()?alias.trim():generatedName(id),role:roleOf(g)};})
    .sort((a,b)=>b.files-a.files||a.order-b.order);
  const n=x=>x.toLocaleString('en'),symbolCount=list.reduce((s,t)=>s+t.symbols,0);
  return {kicker:'MONOLITH',title:publicTitle(recipe)||GENERIC_TITLE,
    stats:`${n(list.length)} ${list.length===1?'file':'files'} · ${n(symbolCount)} ${symbolCount===1?'symbol':'symbols'} · ${n(links)} ${links===1?'link':'links'}`,
    districts};
}
const truncate=(g,text,max)=>{if(g.measureText(text).width<=max)return text;let s=text;while(s.length>1&&g.measureText(s+'…').width>max)s=s.slice(0,-1);return s+'…';};
// createMonolith({canvas}): `canvas(w, h)` makes the layer an unchanged frame is copied from (an OffscreenCanvas by default).
export function createMonolith({canvas=(w,h)=>typeof OffscreenCanvas==='function'?new OffscreenCanvas(w,h):Object.assign(document.createElement('canvas'),{width:w,height:h})}={}){
  let layer=null,key='',shown=null;const stats={frames:0,redraws:0,towers:0,arcs:0};
  // A frame's look: one colour per district (by its persisted order), the core district in stone, tests in the valid colour.
  function look(o){
    const pal=paletteOf(o.recipe),haze=mix(pal.haze,SECTION_TINT[o.section]||SECTION_TINT.home,.16);
    const ramp=[pal.primary,pal.secondary,pal.accent,mix(pal.primary,pal.secondary,.5),mix(pal.secondary,pal.accent,.5),mix(pal.accent,pal.primary,.5),
      mix(pal.primary,pal.highlight,.4),mix(pal.secondary,pal.highlight,.4),mix(pal.accent,pal.highlight,.4)].map(c=>calm(mix(c,pal.deep,.18),.28));
    const colour=(g)=>g?.core?mix(pal.highlight,pal.deep,.4):g?.test?mix(pal.valid,pal.deep,.25):ramp[(Number.isFinite(g?.order)?g.order:0)%ramp.length];
    return {pal,haze,colour};
  }
  // Where the frame puts the site: the bounds of the settled towers, eased toward any tower still rising or fading, so
  // the view widens with the site instead of jumping.
  function frame(list,w,h,text){
    let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity,top=1;
    const settled=list.filter(t=>t.grow>=1&&t.alpha>=1),base=settled.length?settled:list;
    for(const t of base){x0=Math.min(x0,t.x);x1=Math.max(x1,t.x);z0=Math.min(z0,t.z);z1=Math.max(z1,t.z);top=Math.max(top,heightOf(t.storeys)+mastOf(t.storeys));}
    if(settled.length)for(const t of list){if(t.grow>=1&&t.alpha>=1)continue;const k=Math.min(t.grow,t.alpha);
      if(t.x<x0)x0+=(t.x-x0)*k;if(t.x>x1)x1+=(t.x-x1)*k;if(t.z<z0)z0+=(t.z-z0)*k;if(t.z>z1)z1+=(t.z-z1)*k;
      const ht=heightOf(t.storeys)+mastOf(t.storeys);if(ht>top)top+=(ht-top)*k;}
    if(!list.length){x0=x1=z0=z1=0;}
    // Rows further back stand higher, up to an eighth of the frame however deep the site.
    const left=w*.07,right=w*.93,ground=h*(text?.7:.74),ceiling=h*(text?.27:.12),depth=z1-z0;
    const rise=Math.min(depth*RISE*(ground-ceiling)/(top+depth*RISE+.4),h*.125);
    const u=Math.min((right-left)/(x1-x0+WIDTH+1.4),(ground-ceiling-rise)/(top+.4),h*.13),k=depth?rise/depth:0;
    return {u,ox:(left+right)/2-(x0+x1)/2*u,ground,back:ground-rise,left,right,z0,z1,x:t=>(left+right)/2+(t.x-(x0+x1)/2)*u,base:t=>ground-(z1-t.z)*k};
  }
  // How strongly an edit still lights a file, and where its climbing light is (null when done or `still`).
  const lit=(t,o)=>{if(t.litAt===undefined)return 0;const age=(o.now-t.litAt)/(o.speed||1);return age<0||age>7000?0:Math.exp(-age/1800);};
  const climb=(t,o)=>{if(o.still||t.litAt===undefined)return null;const p=(o.now-t.litAt)/(o.speed||1)/1100;return p>=0&&p<1?p:null;};
  function signature(o,list){
    let h=2166136261;const mixIn=v=>{h^=v|0;h=Math.imul(h,16777619);};
    for(const t of list){mixIn(t.x*64);mixIn(t.z*64);mixIn(t.storeys*8);mixIn(t.grow*64);mixIn(t.alpha*64);mixIn(lit(t,o)*24);const c=climb(t,o);mixIn(c===null?-1:c*64);
      mixIn(t.state==='validated'?1:t.state==='stressed'?2:t.state==='draft'?3:0);}
    const r=o.recipe;
    return [o.w,o.h,o.scale||1,o.labels,o.section,o.still,o.version,r?`${r.revision}:${r.family}:${r.title}`:'-',list.length,h>>>0].join('|');
  }
  function background(g,o,L,f,rows){
    const {pal,haze}=L,w=o.w,h=o.h,hb=f.back/h,gy=f.ground/h,floor=f.back<f.ground-2;
    // The sky lightens toward the far edge of the site; the floor, darker, darkens toward the ground line; below it is the
    // section where the dependencies hang.
    const sky=g.createLinearGradient(0,0,0,h);
    sky.addColorStop(0,css(mix(pal.deep,[0,0,0],.3)));sky.addColorStop(hb*.6,css(mix(pal.deep,haze,.28)));sky.addColorStop(hb,css(mix(pal.deep,haze,.6)));
    if(floor){sky.addColorStop(hb+.001,css(mix(pal.deep,haze,.34)));sky.addColorStop(gy,css(mix(pal.deep,haze,.2)));}
    sky.addColorStop(Math.min(1,gy+.001),css(mix(pal.deep,[0,0,0],.12)));sky.addColorStop(1,css(mix(pal.deep,[0,0,0],.4)));
    g.fillStyle=sky;g.fillRect(0,0,w,h);
    // The far edge of the site and its rows of plots, ruled faintly across the floor.
    if(floor){g.fillStyle=css(mix(pal.highlight,haze,.4),.16);g.fillRect(0,f.back,w,1);g.fillStyle=css(mix(pal.highlight,haze,.5),.05);for(const y of rows)g.fillRect(0,y,w,1);}
    // The ground line and its scale (a tick every two plots).
    g.fillStyle=css(mix(pal.highlight,pal.deep,.5),.55);g.fillRect(f.left,f.ground,f.right-f.left,1);
    const step=SQRT3*2*f.u;if(step>=10){g.fillStyle=css(mix(pal.highlight,pal.deep,.55),.4);for(let x=f.ox%step;x<f.right;x+=step)if(x>=f.left)g.fillRect(x,f.ground+1,1,4*(o.k||1));}
  }
  function tower(g,o,L,f,t,col){
    const {pal}=L,u=f.u,w=WIDTH*u,X=f.x(t),Y=f.base(t),depth=f.z1===f.z0?0:(f.z1-t.z)/(f.z1-f.z0);
    const c=mix(col,L.haze,.55*depth),shade=mix(c,pal.deep,.42),hgt=heightOf(t.storeys)*t.grow*u,x=X-w/2,y=Y-hgt,a=t.alpha;
    const light=lit(t,o),stressed=t.state==='stressed',open=t.test||t.state==='draft';
    // The plot it stands on, and its shadow on the floor.
    g.fillStyle=css(pal.deep,.35*a);g.fillRect(x-w*.08,Y,w*1.16,Math.max(2,u*.12));g.fillStyle=css(mix(c,pal.deep,.4),.7*a);g.fillRect(x-w*.18,Y,w*1.36,1);
    if(open){
      g.fillStyle=css(c,(t.test?.07:.15)*a);g.fillRect(x,y,w,hgt);
      g.strokeStyle=css(c,.8*a);g.lineWidth=1;g.strokeRect(x+.5,y+.5,w-1,hgt-1);
      if(t.test){g.beginPath();g.moveTo(X,y);g.lineTo(X,Y);g.stroke();}
    }else{
      const face=stressed?mix(c,pal.warning,.24):c;
      g.fillStyle=css(face,a);g.fillRect(x,y,w*.6,hgt);g.fillStyle=css(stressed?mix(shade,pal.warning,.18):shade,a);g.fillRect(x+w*.6,y,w*.4,hgt);
      g.fillStyle=css(mix(face,pal.highlight,.45),.85*a);g.fillRect(x,y,w,1);
    }
    if(light>0){g.fillStyle=css(pal.accent,.42*light*a);g.fillRect(x,y,w*.6,hgt);}
    // Storeys: hairlines between them, a window on the lit face of each one validated, stressed or lit (detail only where
    // a storey is tall enough to read).
    const sh=STOREY*u*t.grow,n=Math.min(CAP,Math.ceil(t.storeys-1e-6));
    if(sh>=3.2&&n>0){
      g.fillStyle=css(open?c:pal.deep,(open?.35:.3)*a);
      for(let s=0;s<=n;s++)g.fillRect(x+(open?1:0),Y-(PLINTH*u*t.grow+s*sh),w-(open?2:0),1);
      const windows=t.state==='validated'||stressed||light>0;
      if(windows&&sh>=4.5){g.fillStyle=light>0?css(mix(pal.accent,pal.highlight,.3),(.55+.4*light)*a):css(stressed?pal.warning:mix(pal.valid,pal.highlight,.35),.6*a);
        for(let s=0;s<n;s++)g.fillRect(x+w*.14,Y-(PLINTH*u*t.grow+(s+.5)*sh)-Math.max(.5,sh*.12),w*.32,Math.max(1,sh*.24));}
    }
    const mast=mastOf(t.storeys)*t.grow*u;
    if(mast>1){const mw=Math.max(1,u*.07);g.fillStyle=css(mix(c,pal.highlight,.2),a);g.fillRect(X-mw/2,y-mast,mw,mast);g.fillRect(X-mw*1.5,y-mast-mw,mw*3,mw);}
    if(stressed){g.fillStyle=css(pal.warning,.9*a);g.fillRect(x,y,w,Math.max(1,u*.05));}
    const p=climb(t,o);if(p!==null){g.fillStyle=css(mix(pal.accent,pal.highlight,.5),(1-p)*.9*a);g.fillRect(x,Y-hgt*ease(p)-1.5,w,3);}
    return {x:X,top:y-mast,base:Y,light};
  }
  // Dependencies as arcs hanging from the ground line: the links between districts first and brighter.
  function arcs(g,o,L,f,pos){
    const {pal}=L,edges=[...(o.edges?.values?.()||[])].filter(e=>e.kind==='depends'&&pos.has(e.a)&&pos.has(e.b)&&e.a!==e.b);
    const deep=Math.max(8,Math.min(f.ground*.32,o.h*(o.text?.86:.96)-f.ground-6)),hot=[];let n=0;
    for(const cross of [true,false]){
      g.beginPath();
      for(const e of edges){if(!!e.cross!==cross||n>=MAX_ARCS)continue;const a=pos.get(e.a),b=pos.get(e.b),d=Math.max(4,deep*Math.sqrt(Math.abs(a.x-b.x)/(f.right-f.left)));
        g.moveTo(a.x,f.ground+1);g.quadraticCurveTo((a.x+b.x)/2,f.ground+1+2*d,b.x,f.ground+1);n++;if(a.light>0||b.light>0)hot.push([a,b,d,Math.max(a.light,b.light)]);}
      const fade=clamp(Math.sqrt(60/Math.max(1,Math.min(edges.length,MAX_ARCS))),.4,1);
      g.strokeStyle=cross?css(mix(pal.accent,pal.highlight,.3),.32*fade):css(mix(pal.accent,pal.deep,.3),.18*fade);g.lineWidth=Math.max(.8,(o.k||1)*.9);g.stroke();
    }
    for(const [a,b,d,l] of hot){g.strokeStyle=css(pal.accent,.6*l);g.beginPath();g.moveTo(a.x,f.ground+1);g.quadraticCurveTo((a.x+b.x)/2,f.ground+1+2*d,b.x,f.ground+1);g.stroke();}
    return n;
  }
  function text(g,o,L,list){
    const {pal}=L,k=o.k||1,x=o.w*.07,right=o.w*.93,top=o.h*.085;
    const links=[...(o.edges?.values?.()||[])].filter(e=>e.kind==='depends').length;
    const c=captions(list,{groups:o.groups,recipe:o.recipe,links});
    g.textBaseline='alphabetic';g.textAlign='left';
    g.font=`600 ${Math.round(10.5*k)}px ${FONT}`;g.letterSpacing=`${(2.2*k).toFixed(1)}px`;g.fillStyle=css(mix(pal.highlight,pal.deep,.4));g.fillText(c.kicker,x,top);
    g.letterSpacing='0px';g.font=`600 ${Math.round(24*k)}px ${FONT}`;g.fillStyle=css(pal.highlight);g.fillText(truncate(g,c.title,o.w*.46),x,top+30*k);
    g.font=`400 ${Math.round(12.5*k)}px ${FONT}`;g.fillStyle=css(mix(pal.highlight,pal.deep,.35));g.fillText(c.stats,x,top+52*k);
    // The districts, largest first: swatch, alias (or generated name) and role, files.
    const rows=c.districts.slice(0,c.districts.length>6?5:6),bw=Math.min(240*k,o.w*.3),lx=right-bw;
    rows.forEach((d,i)=>{const y=top+i*20*k,group=o.groups?.get(d.id);
      g.fillStyle=css(L.colour(group));g.fillRect(lx,y-8*k,8*k,8*k);
      g.textAlign='left';g.font=`500 ${Math.round(12*k)}px ${FONT}`;g.fillStyle=css(mix(pal.highlight,pal.deep,.12));const name=truncate(g,d.name,bw-130*k);g.fillText(name,lx+16*k,y);
      const nw=g.measureText(name).width;g.font=`400 ${Math.round(11*k)}px ${FONT}`;g.fillStyle=css(mix(pal.highlight,pal.deep,.5));g.fillText(d.role,lx+22*k+nw,y);
      g.textAlign='right';g.font=`400 ${Math.round(12*k)}px ${FONT}`;g.fillStyle=css(mix(pal.highlight,pal.deep,.4));g.fillText(`${d.files} ${d.files===1?'file':'files'}`,right,y);});
    if(c.districts.length>rows.length){g.textAlign='left';g.font=`400 ${Math.round(12*k)}px ${FONT}`;g.fillStyle=css(mix(pal.highlight,pal.deep,.45));
      g.fillText(`and ${c.districts.length-rows.length} more ${c.districts.length-rows.length===1?'district':'districts'}`,lx+16*k,top+rows.length*20*k);}
    g.textAlign='left';g.font=`400 ${Math.round(11*k)}px ${FONT}`;g.fillStyle=css(mix(pal.highlight,pal.deep,.5));
    g.fillText('Each tower is a file and its storeys are symbols · arcs below are dependencies, brighter between districts',x,o.h*.955);
    return c;
  }
  function render(g,o,list){
    const L=look(o),f=frame(list,o.w,o.h,o.text);
    background(g,o,L,f,new Set(list.map(t=>Math.round(f.base(t)))));
    const pos=new Map();
    for(const t of list){const p=tower(g,o,L,f,t,L.colour(o.groups?.get(t.group)));pos.set(t.id,p);}
    stats.arcs=arcs(g,o,L,f,pos);
    if(o.text)text(g,o,L,list);
    return {L,f,pos};
  }
  // On top of the copied frame: the beat on the ground line, a commit's sweep or a failure's red, the agents' marks.
  function overlay(g,o,{L,f,pos}){
    const {pal}=L,k=o.k||1,span=f.right-f.left;
    if(!o.still&&o.pulse>0){g.fillStyle=css(mix(pal.highlight,L.haze,.3),.1*o.pulse+.08*(o.energy||0));g.fillRect(f.left,f.ground-1,span,3);}
    for(const m of o.marks||[]){const p=(o.now-m.at)/(o.speed||1)/2400;if(p<0||p>=1)continue;
      if(m.kind==='strain'){g.fillStyle=css(pal.warning,(1-p)*.85);g.fillRect(f.left,f.ground-1,span,3);g.fillStyle=css(pal.warning,(1-p)*.07);g.fillRect(0,f.ground+2,o.w,o.h-f.ground);continue;}
      if(o.still){g.fillStyle=css(pal.valid,(1-p)*.8);g.fillRect(f.left,f.ground-1,span,3);continue;}
      const head=f.left+span*ease(p),len=span*.22,grad=g.createLinearGradient(head-len,0,head,0);
      grad.addColorStop(0,css(pal.valid,0));grad.addColorStop(1,css(mix(pal.valid,pal.highlight,.4),.95*(1-p*.5)));
      g.fillStyle=grad;g.fillRect(Math.max(f.left,head-len),f.ground-1,Math.min(len,head-f.left),3);
    }
    const stack=new Map();
    for(const [voice,a] of o.agents||[]){const t=pos.get(a.id),age=(o.now-a.at)/(o.speed||1);if(!t||age<0)continue;
      const alpha=age<30000?1:clamp(1-(age-30000)/15000);if(alpha<=0)continue;
      const i=stack.get(a.id)||0;stack.set(a.id,i+1);const y=t.top-14*k-i*12*k,s=4*k,colour=AGENT_COLORS[voice%8];
      g.fillStyle=css(rgb(colour),.55*alpha);g.fillRect(t.x-.5,y,1,t.top-y);
      g.fillStyle=css(rgb(colour),alpha);g.beginPath();g.moveTo(t.x,y-s);g.lineTo(t.x+s,y);g.lineTo(t.x,y+s);g.lineTo(t.x-s,y);g.closePath();g.fill();
    }
  }
  // draw(g, {w, h, scale, now, speed, nodes, groups, edges, marks, agents, version, recipe, labels, section, pulse, energy,
  // still}): one frame on a 2D context already scaled to CSS pixels. Without `nodes`, the empty ground (another world is
  // loading).
  function draw(g,o){
    stats.frames++;
    const k=clamp(Math.min(o.w/1280,o.h/720),.6,2),view={...o,k,text:!!o.nodes&&o.labels!=='off'&&o.w>=560&&o.h>=300};
    const list=o.nodes?towers(o.nodes,o.now,o):[],scale=o.scale||1,next=signature(view,list);
    const W=Math.max(1,Math.round(o.w*scale)),H=Math.max(1,Math.round(o.h*scale));
    if(!layer||layer.width!==W||layer.height!==H)layer=canvas(W,H),key='';
    if(next!==key){const c=layer.getContext('2d');c.setTransform(scale,0,0,scale,0,0);shown=render(c,view,list);key=next;stats.redraws++;stats.towers=list.length;}
    g.drawImage(layer,0,0,o.w,o.h);
    overlay(g,view,shown);
  }
  return {draw,stats:()=>({...stats})};
}

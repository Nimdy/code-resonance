// Agent touches: the moment an agent edits a file (or, more gently, reads or searches it), as a short gesture on that
// file that each flagship world draws in its own grammar (biosphere.js, stellar.js, cathedral.js). A touch begins at
// the agent's own hook-reported tool event for the file, as agents.js folded it (an edit's presence lasts a fraction of a
// second; its touch lasts a few seconds), never at the moment the change reaches the model. A file is touched again only
// after a cooldown, except that an edit following a read of it still shows. Durations are in view seconds (an 8x replay
// keeps their length and spaces them as it plays).
// Pure: a function of the presences' recorded events and the frame's time, never of wall-clock time or Math.random, so
// replays, seeks and films draw the same touches. Presentation only: nothing here reaches the director, the recipe or
// digital life. No imports (the sprites take THREE from the world), so Node tests load it as it is.
export const TOUCH_STRENGTH=Object.freeze({editing:1,reading:.45,searching:.45});
export const TOUCH_SECONDS=3.2,TOUCH_COOLDOWN=2.4,TOUCH_UPGRADE=.8;
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
// The light of a touch `age` view seconds after it began: a quick rise, then a long fall to nothing.
export function touchEnvelope(age){return age<0||age>=TOUCH_SECONDS?0:smooth(age/.15)*Math.pow(1-age/TOUCH_SECONDS,1.6);}
// How far along its file a touch has run: 0 when it begins, 1 at the tip after 0.9 s.
export const touchTravel=age=>smooth(age/.9);
// A ring of light from the touched point: its radius (0..1) and its light, or null outside its span.
export function touchRing(age,delay=.3,span=1.3){const x=(age-delay)/span;if(x<0||x>=1)return null;return {r:1-Math.pow(1-x,3),a:Math.pow(1-x,1.5)*smooth(x/.08)};}
// How strongly a world draws touches: with its presences' prominence, and quieter (never gone) without spectacle.
export function touchGain(genome,overrides){const p=Number.isFinite(genome?.agentProminence)?Math.max(0,Math.min(1,genome.agentProminence)):.8,s=overrides?.intensity??1;
  return Math.min(1.25,p/.8)*(s<=0?.35:Math.min(1.2,.65+.35*s));}
// The touches at time t: at most `max`, the most visible first, one per file. `agents` is the presence fold (its trail),
// `presences` the frame's agents; `known(fileId)` keeps only the files the world draws.
export function touchesAt(agents,presences,t,speed=1,{max=4,known=null,seconds=TOUCH_SECONDS,cooldown=TOUCH_COOLDOWN}={}){
  if(!agents?.trail||!presences?.length||!Number.isFinite(t))return [];
  const sp=speed>0?speed:1,cool=cooldown*sp*1000,up=TOUCH_UPGRADE*sp*1000;
  // Far enough back that a chain of touches on one file is the same however the frames fall (bounded by the fold's ten minutes).
  const span=Math.min(600000,Math.max(60000,(seconds+cooldown)*sp*8000));
  const ev=[];
  for(const p of presences){for(const e of agents.trail(p.id,t,span)){const k=TOUCH_STRENGTH[e.activity];
    if(e.state==='tool'&&e.fileId&&k&&(!known||known(e.fileId)))ev.push({ts:e.ts,fileId:e.fileId,agentId:p.id,voice:Number.isInteger(p.voice)?p.voice:0,activity:e.activity,k});}}
  ev.sort((a,b)=>a.ts-b.ts||(a.agentId<b.agentId?-1:a.agentId>b.agentId?1:0)||(a.k-b.k));
  const onset=new Map();
  for(const e of ev){const l=onset.get(e.fileId);
    if(!l||e.ts-l.ts>=cool){onset.set(e.fileId,{...e});continue;}
    // An edit soon after a read of the same file: the touch it began becomes an edit (it keeps its start).
    if(e.k>l.k){if(e.ts-l.ts>=up)onset.set(e.fileId,{...e});else Object.assign(l,{k:e.k,activity:e.activity,agentId:e.agentId,voice:e.voice});}}
  const out=[];
  for(const x of onset.values()){const age=(t-x.ts)/sp/1000;if(age<0||age>=seconds)continue;
    out.push({fileId:x.fileId,agentId:x.agentId,voice:x.voice,activity:x.activity,kind:x.k>=1?'edit':'read',k:x.k,at:x.ts,age,env:touchEnvelope(age)});}
  out.sort((a,b)=>b.env*b.k-a.env*a.k||b.at-a.at||(a.fileId<b.fileId?-1:1));
  return out.slice(0,max);
}
// Where a presence lingers after its tool events: per file, a weight that rises over half a second after each of its
// events there and falls after two seconds, the newest event's or an earlier one's, whichever is higher (so the weight
// never jumps, and a presence visits the file it just edited even though the edit's tool lasted a moment).
export const touchHold=age=>age<0?0:smooth(age/.5)*(1-smooth((age-2.2)/1));
export function touchVisits(agents,agentId,t,speed=1,known=null){
  const sp=speed>0?speed:1,w=new Map();if(!agents?.trail||!Number.isFinite(t))return [];
  for(const e of agents.trail(agentId,t,3200*sp+1)){if(e.state!=='tool'||!e.fileId||!TOUCH_STRENGTH[e.activity]||(known&&!known(e.fileId)))continue;
    const h=touchHold((t-e.ts)/sp/1000);if(h>(w.get(e.fileId)||0))w.set(e.fileId,h);}
  return [...w].filter(([,x])=>x>1e-4).map(([fileId,x])=>({fileId,w:x})).sort((a,b)=>a.fileId<b.fileId?-1:1);
}
// A presence's place among the files it visits: its own goal drawn toward each visited file by that file's weight (a
// weighted mean, continuous in the weights). `at(fileId)` gives a file's place ({x,y,z}) or null; `out` receives it.
export function visitBlend(goal,visits,at,out){
  let x=0,y=0,z=0,total=0;for(const v of visits){const p=at(v.fileId);if(!p)continue;x+=p.x*v.w;y+=p.y*v.w;z+=p.z*v.w;total+=v.w;}
  if(total<=0){if(out!==goal){out.x=goal.x;out.y=goal.y;out.z=goal.z;}return out;}
  const k0=Math.max(0,1-total),d=k0+total;out.x=(goal.x*k0+x)/d;out.y=(goal.y*k0+y)/d;out.z=(goal.z*k0+z)/d;return out;
}
// The strongest touch an agent is making now (for its presence's own light), or null.
export const touchOf=(touches,agentId)=>touches.find(x=>x.agentId===agentId)||null;
// The touches' light as sprites (one draw call): soft cores (kind 0), thin rings (1) and four-point glints (2), sized in
// pixels at 1080 lines with a floor from their world size, so a touch reads from the establishing view of a large
// project. `uniforms` shares the world's uPx and uRes.
export function touchSprites(THREE,{capacity=48,uniforms}){
  const P=new Float32Array(capacity*3),C=new Float32Array(capacity*4),S=new Float32Array(capacity*4),g=new THREE.BufferGeometry();
  const attr=(a,n)=>{const x=new THREE.BufferAttribute(a,n);x.setUsage(THREE.DynamicDrawUsage);return x;};
  g.setAttribute('position',attr(P,3));g.setAttribute('tC',attr(C,4));g.setAttribute('tS',attr(S,4));g.setDrawRange(0,0);
  const material=new THREE.ShaderMaterial({uniforms:{uPx:uniforms.uPx,uRes:uniforms.uRes},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec4 tC,tS;uniform float uPx;uniform vec2 uRes;varying vec4 vC;varying vec2 vS;
      void main(){vec4 mv=viewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;float px=projectionMatrix[1][1]*uRes.y*.5;
        gl_PointSize=clamp(max(tS.x*uPx,tS.y*px/max(.2,-mv.z)),1.,420.*uPx);vC=tC;vS=tS.zw;}`,
    fragmentShader:`varying vec4 vC;varying vec2 vS;void main(){vec2 q=(gl_PointCoord-.5)*2.;float r=length(q);if(r>1.)discard;float g;
      if(vS.x<.5)g=exp(-r*r*7.)*.8+exp(-r*r*40.)*1.6;
      else if(vS.x<1.5){float w=max(.03,vS.y);g=exp(-pow((r-(1.-w*1.8))/w,2.))*(1.-smoothstep(.9,1.,r))+exp(-r*r*5.)*.06;}
      else{float x=pow(max(0.,1.-abs(q.x)*7.),3.)*pow(1.-abs(q.y),2.)+pow(max(0.,1.-abs(q.y)*7.),3.)*pow(1.-abs(q.x),2.);g=exp(-r*r*14.)*1.4+x*.9;}
      gl_FragColor=vec4(vC.rgb*g*vC.a,1.);}`});
  const points=new THREE.Points(g,material);points.frustumCulled=false;
  let n=0;
  return {points,
    begin(){n=0;},
    // p: a position, c: a colour; px: the size in pixels at 1080 lines; world: the size in world units it never drops below.
    add(p,c,a,px,{world=0,kind=0,width=.1}={}){if(n>=capacity||!(a>.002))return;const o=n*3,o4=n*4;P[o]=p.x;P[o+1]=p.y;P[o+2]=p.z;
      C[o4]=c.r;C[o4+1]=c.g;C[o4+2]=c.b;C[o4+3]=a;S[o4]=px;S[o4+1]=world;S[o4+2]=kind;S[o4+3]=width;n++;},
    commit(){g.setDrawRange(0,n);for(const k of ['position','tC','tS'])g.attributes[k].needsUpdate=true;},
    get count(){return n;},
    dispose(){g.dispose();material.dispose();}};
}

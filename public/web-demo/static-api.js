'use strict';
// The web demo's static mode (scripts/build-site.js includes it in the site's page only; the receiver never serves it).
// It runs before the engine and answers what the player asks a receiver for, from the files the build exported:
// - GET /api/* and /health: the exported answer for that exact path and sorted query (api/index.json maps each one),
//   fetched once relative to this site and kept in memory; /api/project answers 304 to its own ETag, as the receiver
//   does. A request that was not exported answers 404, as the receiver does for what it does not have.
// - GET /api/recipe: the recording's identity in the world family chosen last (choosing a family saves one in the
//   receiver; here the choice lasts until the page is closed).
// - POST: inert. A control session is granted (there is nothing to protect), choosing a family switches the world as
//   above, a family preview answers its exported candidate, settings, preferences, presets and compositions answer
//   what they hold (nothing is stored), and anything else says it needs Code Resonance on your own computer.
// - The change feed (EventSource /api/changes): a stand-in that opens once and never announces a change.
// Nothing leaves the browser: every request this page makes goes to the site it came from (and its content policy
// allows nothing else).
(()=>{
  const ROOT=new URL('../',document.currentScript.src);
  const realFetch=window.fetch.bind(window),RealEventSource=window.EventSource;
  document.documentElement.dataset.webDemo='';
  // The site is the Performance Stage only: the Control Center needs a receiver of your own.
  const STAGE='#/stage',onStage=()=>/^#\/stage(?:\/|$)/.test(location.hash);
  const toStage=()=>{if(!onStage())history.replaceState(null,'',location.pathname+location.search+STAGE);};
  toStage();addEventListener('hashchange',toStage);
  // The same key as scripts/build-site.js keyOf().
  const keyOf=(pathname,search)=>{const q=new URLSearchParams(search);q.sort();const s=q.toString();return s?`${pathname}?${s}`:pathname;};
  let manifest=null;
  const ready=realFetch(new URL('api/index.json',ROOT)).then(r=>{if(!r.ok)throw new Error(`api/index.json: HTTP ${r.status}`);return r.json();}).then(m=>{manifest=m;return m;});
  const texts=new Map();
  const file=rel=>{if(!texts.has(rel))texts.set(rel,realFetch(new URL(rel,ROOT)).then(r=>{if(!r.ok)throw new Error(`${rel}: HTTP ${r.status}`);return r.text();}).catch(e=>{texts.delete(rel);throw e;}));return texts.get(rel);};
  let family=null;
  const recipeFile=()=>family&&manifest.recipe.families[family]||manifest.recipe.file;
  const answer=(status,body,headers={})=>new Response(body===null?null:typeof body==='string'?body:JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});
  const notHere=what=>answer(403,{error:`${what} needs Code Resonance running on your own computer: the web demo only replays a recording.`,code:'web-demo'});
  // The path a request names: the player asks for /api/… from the site's root; a relative api/… also maps here.
  function route(u){
    const base=new URL(ROOT).pathname;
    if(u.pathname==='/health'||u.pathname.startsWith('/api/'))return u.pathname;
    if(u.pathname.startsWith(base)){const rest='/'+u.pathname.slice(base.length);if(rest==='/health'||rest.startsWith('/api/'))return rest;}
    return null;
  }
  async function bodyOf(input,init){
    try{const b=init?.body??(input instanceof Request?await input.clone().text():null);return typeof b==='string'?JSON.parse(b):null;}catch{return null;}
  }
  async function get(path,u,headers){
    const m=manifest||await ready;
    if(path==='/api/recipe'&&u.searchParams.get('id')===m.project&&!u.searchParams.has('fallback'))return answer(200,await file(recipeFile()));
    const r=m.routes[keyOf(path,u.search)];
    if(!r)return answer(404,{error:'Not part of the web demo'});
    if(r.etag&&headers.get('if-none-match')===r.etag)return answer(304,null,{ETag:r.etag});
    return answer(200,await file(r.file),r.etag?{ETag:r.etag}:{});
  }
  async function post(path,u,body){
    const m=manifest||await ready;
    const actions=Array.isArray(body?.actions)?body.actions:body?.action!==undefined?[body.action]:[];
    const families=actions.length&&actions.every(a=>a?.type==='family'&&Object.hasOwn(m.recipe.families,a.family))?actions.map(a=>a.family):null;
    switch(path){
      case '/api/session':return answer(200,{capability:'web-demo',expiresAt:Date.now()+864e5,scopes:[]});
      case '/api/recipe':
        if(u.searchParams.get('id')!==m.project)return answer(404,{error:'Project not found'});
        // Choosing a world family: the recording's identity in that family, for this page only.
        if(families)family=families.at(-1);
        return answer(200,await file(recipeFile()));
      case '/api/recipe/preview':
        if(u.searchParams.get('id')!==m.project)return answer(404,{error:'Project not found'});
        if(families&&families.length===1)return answer(200,await file(m.recipe.previews[families[0]]));
        return notHere('Editing a visual identity');
      // Documents a view saves (a world or an information mode chosen on the Stage): what they hold, unchanged.
      case '/api/settings':case '/api/presets':case '/api/compositions':case '/api/preferences':return get(path,u,new Headers());
      default:return notHere('This');
    }
  }
  window.fetch=async function(input,init){
    const u=new URL(input instanceof Request?input.url:String(input),location.href);
    const path=u.origin===location.origin?route(u):null;
    if(path===null)return realFetch(input,init);
    const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
    try{
      if(method==='GET'||method==='HEAD')return await get(path,u,new Headers(init?.headers||(input instanceof Request?input.headers:undefined)));
      return await post(path,u,await bodyOf(input,init));
    }catch(e){
      // The site's own files could not be read (offline, or a partial deployment): as a receiver that does not answer.
      throw new TypeError(`Failed to fetch (web demo: ${e.message})`);
    }
  };
  // The change feed: opens once (the interface then reads everything once, as after a reconnection) and stays quiet.
  class StaticEventSource extends EventTarget{
    constructor(url){super();this.url=String(url);this.withCredentials=false;this.readyState=0;this.onopen=null;this.onmessage=null;this.onerror=null;
      setTimeout(()=>{if(this.readyState===2)return;this.readyState=1;const open=new Event('open');this.onopen?.(open);this.dispatchEvent(open);
        this.dispatchEvent(new MessageEvent('hello',{data:JSON.stringify({type:'hello',webDemo:true})}));},0);}
    close(){this.readyState=2;}
  }
  StaticEventSource.CONNECTING=0;StaticEventSource.OPEN=1;StaticEventSource.CLOSED=2;
  window.EventSource=function EventSource(url,options){const u=new URL(String(url),location.href);
    return u.origin===location.origin&&route(u)==='/api/changes'?new StaticEventSource(u.href):new RealEventSource(url,options);};
  Object.assign(window.EventSource,{CONNECTING:0,OPEN:1,CLOSED:2});
  // What the landing (demo.js) reads: the recording, the worlds, and the family shown now.
  window.ResonanceStatic={ready,get manifest(){return manifest;},get family(){return family||manifest?.recipe.family||null;}};
})();

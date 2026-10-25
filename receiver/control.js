'use strict';
// Control capabilities: what an administrative (mutating) browser request must carry. The player page asks for one
// (POST /api/session) and sends it back in X-Resonance-Capability. A custom header forces a CORS preflight for any
// cross-origin page and the receiver never answers one, so another site cannot make the browser send it (CSRF-proof).
// Capabilities live in memory only, keyed by their sha256 (the raw value is never kept): a restart invalidates them all.
// Pairing: a capability is issued only for the receiver's pairing key (receiver-auth.json, readable by its owner only),
// which the page receives once in a link (`npm start`, `npm run doctor`, VS Code's Open Stage) and keeps. Loopback and
// Origin alone would admit any local process, including another account on the same computer.
const crypto=require('node:crypto');
const SCOPES=Object.freeze(['configure','packs','integrations']);
// The socket address, not a header: a LAN client of a receiver started with RESONANCE_ALLOW_REMOTE=1 cannot forge it.
const LOOPBACK=new Set(['127.0.0.1','::1','::ffff:127.0.0.1']);
const HEADER='x-resonance-capability';
const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
const refuse=(status,code,error)=>({ok:false,status,code,error});
function loopback(req){return LOOPBACK.has(req?.socket?.remoteAddress);}
function originOk(req,expectedOrigins){const o=req?.headers?.origin;return typeof o==='string'&&(expectedOrigins||[]).includes(o);}
function createControl({ttlMs=12*3600*1000,max=64,now=Date.now}={}){
  // Insertion order is recency order (a verified use re-inserts), so the first entry is the least recently used.
  const live=new Map();
  function issue(req,expectedOrigins,{pairing=null,offered=null}={}){
    if(!loopback(req))return refuse(403,'remote-refused','Control sessions are issued to loopback clients only');
    if(!originOk(req,expectedOrigins))return refuse(403,'origin-refused','Same-origin request required');
    // Fetch metadata, when the browser sends it: a fetch() from the player page itself, never a navigation or a frame.
    const site=req.headers['sec-fetch-site'],dest=req.headers['sec-fetch-dest'];
    if(site!==undefined&&site!=='same-origin')return refuse(403,'cross-site-refused','Same-origin fetch required');
    if(dest!==undefined&&dest!=='empty')return refuse(403,'cross-site-refused','Unexpected request destination');
    if(pairing&&!(typeof offered==='string'&&offered.length===pairing.length&&crypto.timingSafeEqual(Buffer.from(offered),Buffer.from(pairing))))
      return refuse(403,'pairing-required','This browser is not paired with the receiver: open the link that npm start (or npm run doctor) prints');
    const t=now();
    // Room first from expired entries, then from the least recently used live ones.
    if(live.size>=max)for(const [k,v] of live)if(v.expiresAt<=t)live.delete(k);
    while(live.size>=max)live.delete(live.keys().next().value);
    const capability=crypto.randomBytes(32).toString('hex'),expiresAt=t+ttlMs;
    live.set(sha256(capability),{expiresAt,scopes:SCOPES,issuedAt:t});
    return {ok:true,capability,expiresAt,scopes:[...SCOPES]};
  }
  // `read`: a GET that may show capability-only fields. Browsers send no Origin on a same-origin GET, so a read may
  // come without one (never with a foreign one, and never as a cross-site request): the custom header alone already
  // means a script of this origin, since a cross-origin page cannot send it without the preflight that is never answered.
  function verify(req,expectedOrigins,scope,{read=false}={}){
    const required=refuse(401,'capability-required','A control capability is required');
    const site=req?.headers?.['sec-fetch-site'],bare=read&&req?.headers?.origin===undefined&&(site===undefined||site==='same-origin');
    if(!loopback(req)||!(bare||originOk(req,expectedOrigins)))return required;
    const raw=req.headers[HEADER];
    if(typeof raw!=='string'||!/^[0-9a-f]{64}$/.test(raw))return required;
    const key=sha256(raw),entry=live.get(key);if(!entry)return required;
    const t=now();
    // Expired entries stay until evicted, so the client learns why (and asks for a new one) instead of a generic refusal.
    if(entry.expiresAt<=t)return refuse(401,'capability-expired','The control capability has expired');
    if(scope&&!entry.scopes.includes(scope))return refuse(403,'capability-scope','The control capability does not cover this action');
    // Sliding TTL: each verified use extends it.
    entry.expiresAt=t+ttlMs;live.delete(key);live.set(key,entry);
    return {ok:true,expiresAt:entry.expiresAt,scopes:[...entry.scopes]};
  }
  function count(){const t=now();let n=0;for(const v of live.values())if(v.expiresAt>t)n++;return n;}
  return {issue,verify,read:(req,expectedOrigins)=>verify(req,expectedOrigins,null,{read:true}),count,clear(){live.clear();}};
}
module.exports={createControl,SCOPES,HEADER,loopback};

'use strict';
// The web demo's landing (scripts/build-site.js includes it in the site's page only, after the engine): the
// Performance Stage replaying the recording, with what a first visit needs and nothing that needs a receiver.
// - An introduction over the world (it replays silently behind it): what this is, Start (the music needs a click),
//   and that it is a recording of a real project and nothing is sent anywhere.
// - On the Stage's own controls: the site's name and links in the top bar, the six world families and the Aurora
//   preview with the Construct and Monolith in place of the Stage's three-way choice, and no Live, Control Center or new-window controls (they
//   need a receiver of your own). Speed, scrubbing, information modes, quality, sound and recording are the Stage's.
// - The replay starts again when it reaches the end.
(()=>{
  const P=window.ResonancePlayer,S=window.ResonanceStatic;
  if(!P||!S||P.film||P.overlay)return;
  const REPO='https://github.com/Nimdy/code-resonance',GUIDE=`${REPO}/blob/main/docs/FIRST-RUN.md`;
  // The worlds offered: the built-in families (from the exported recipes, in the receiver's order), then the stages.
  const ABOUT={
    'stellar-forge':'A galaxy: subsystems are star systems, verified milestones leave a nova’s remnant.',
    'fractal-biosphere':'A bioluminescent reef: each subsystem grows as an organism, blooms stay.',
    'machine-cathedral':'A cathedral city on black water: verified milestones gild the great spire.',
    'synaptic-storm':'Glassy neurons wired by the real dependencies; agents travel as signals.',
    'fractal-continuum':'One raymarched fractal whose recursion unfolds with the live code.',
    'temporal-terrain':'The history as a contour landscape: the present at the front edge, the past toward the horizon.',
    'aurora':'A polar night over a frozen lake: subsystems are curtains of the aurora, agents wisps that ignite their rays.',
    construct:'The software as an illuminated architectural model being built.',
    city:'A flat architectural elevation in Canvas 2D, light on any device.'};
  const NAMES={'stellar-forge':'Stellar Forge','fractal-biosphere':'Fractal Biosphere','machine-cathedral':'Machine Cathedral','synaptic-storm':'Synaptic Storm','fractal-continuum':'Fractal Continuum','temporal-terrain':'Temporal Terrain','aurora':'Aurora',construct:'The Construct',city:'Monolith'};
  let worlds=[],ui=null,busyWorld=null;
  const el=(tag,props={},...children)=>{const e=document.createElement(tag);
    for(const [k,v] of Object.entries(props)){if(v===null||v===undefined||v===false)continue;if(k==='class')e.className=v;else if(k==='text')e.textContent=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else e.setAttribute(k,v===true?'':String(v));}
    for(const c of children.flat())if(c!==null&&c!==undefined&&c!==false)e.append(c instanceof Node?c:document.createTextNode(String(c)));return e;};
  const icon=name=>ui?.icon?ui.icon(name):null;
  const shown=()=>P.state.world==='living'?P.state.recipe?.family||null:P.state.world;
  // ---- The replay: from the start once the project is loaded, again at the end -----------------------------------
  // The engine opens in live mode; the recording is long over, so the demo switches to its replay once the project is
  // known (which also loads the world), and plays it, silently until Start.
  let replaying=false,autoplayed=false,lastNow=0,wasPlaying=false;
  P.on(t=>{
    const s=P.state;
    if(!replaying&&s.model&&s.project){replaying=true;P.setMode('replay');}
    if(replaying&&s.mode==='replay'&&s.position.loaded&&s.position.events){
      if(!autoplayed){autoplayed=true;if(!s.playing)P.play();}
      // The end of the recording: play it again (a seek by the viewer to the end does not count).
      if(wasPlaying&&!s.playing&&s.position.now>=s.position.end&&lastNow>=s.position.end-4000*(s.speed||1))P.play();
      wasPlaying=s.playing;lastNow=s.position.now;
    }
    if(t.has('world')||t.has('recipe')||t.has('preview'))renderWorlds();
  });
  // ---- Introduction ------------------------------------------------------------------------------------------------
  const startBtn=el('button',{type:'button',class:'btn primary lg wd-start',id:'wdStart'},el('span',{text:'Start the performance'}));
  const quietBtn=el('button',{type:'button',class:'btn ghost wd-quiet',id:'wdQuiet',text:'Watch without sound'});
  const intro=el('section',{class:'wd-intro',id:'wdIntro',role:'dialog','aria-modal':'false','aria-labelledby':'wdIntroTitle','aria-describedby':'wdIntroText'},
    el('div',{class:'wd-intro-card'},
      el('div',{class:'wd-mark'},el('div',{class:'glyph','aria-hidden':'true'},el('i'),el('i'),el('i')),el('span',{class:'eyebrow',text:'Code Resonance · Web demo'})),
      el('h1',{class:'wd-title',id:'wdIntroTitle',text:'Software development, performed live'}),
      el('p',{class:'wd-text',id:'wdIntroText',text:'Code Resonance turns real development into a generative world and a composed score. This is Lumen Recipes, a real four-minute session in which six Claude Code agents built a small recipe app, replayed by the real player in your browser.'}),
      el('div',{class:'wd-actions'},startBtn,quietBtn),
      el('p',{class:'wd-privacy'},el('span',{class:'pill ok',text:'Recorded from a real project'}),el('span',{text:'Nothing is installed and nothing is sent anywhere: the page only reads its own files.'})),
      el('p',{class:'wd-links'},el('a',{href:REPO,target:'_blank',rel:'noopener',text:'Source on GitHub'}),el('span',{'aria-hidden':'true',text:'·'}),
        el('a',{href:GUIDE,target:'_blank',rel:'noopener',text:'Run it on your own project'}))));
  document.body.append(intro);
  function dismiss(){intro.hidden=true;document.body.classList.remove('wd-intro-open');}
  document.body.classList.add('wd-intro-open');
  startBtn.addEventListener('click',async()=>{
    dismiss();
    // The music needs this click; the replay starts again from the beginning with it.
    const sound=P.state.sound.enabled?Promise.resolve():P.toggleSound().catch(e=>ui?.toast?.(`Sound could not start: ${e.message}`,'warning'));
    await sound;
    const s=P.state.position;if(s.loaded){P.seek(s.start);P.play();}
  });
  quietBtn.addEventListener('click',dismiss);
  // ---- The Stage's controls, adapted each time the Stage is drawn --------------------------------------------------
  const chrome=document.getElementById('stageChrome');
  function adapt(shell){
    if(!shell||shell.dataset.webDemo)return;shell.dataset.webDemo='1';
    const top=shell.querySelector('.stage-top'),title=shell.querySelector('.stage-title');
    if(top&&title){
      title.before(el('a',{class:'wd-brand',href:REPO,target:'_blank',rel:'noopener',title:'Code Resonance on GitHub'},
        el('span',{class:'glyph','aria-hidden':'true'},el('i'),el('i'),el('i')),el('span',{class:'wd-brand-text'},el('strong',{text:'Code Resonance'}),el('span',{text:'Web demo · a recording, nothing is sent'}))));
      const links=el('div',{class:'stage-group wd-links-top',role:'group','aria-label':'About'},
        el('a',{class:'btn ghost sm',href:GUIDE,target:'_blank',rel:'noopener',title:'Install it and watch your own project (Getting started)'},icon('external'),el('span',{text:'Get started'})),
        el('a',{class:'btn ghost sm',href:REPO,target:'_blank',rel:'noopener',title:'The source code on GitHub'},el('span',{text:'GitHub'})));
      (top.querySelector('.stage-present')||top.lastElementChild).before(links);
    }
    // The way to the Control Center and its keys: there is none here.
    for(const s of shell.querySelectorAll('.stage-hints span'))if(/Control Center/.test(s.textContent))s.remove();
    for(const dd of shell.querySelectorAll('.stage-keys dd'))if(/Control Center/.test(dd.textContent)){dd.previousElementSibling?.remove();dd.remove();}
    const old=shell.querySelector('.stage-worlds');
    if(old){const group=el('div',{class:'stage-worlds wd-worlds',role:'group','aria-label':'Visual world'});
      const pick=el('select',{class:'select wd-world-select','aria-label':'Visual world',id:'wdWorldSelect'});
      for(const w of worlds){
        const b=el('button',{type:'button',class:'btn sm world','data-wd-world':w.id,'aria-pressed':'false',title:`${w.name}${w.preview?' (preview)':''}: ${w.about}`},
          el('span',{text:w.short}),w.preview?el('span',{class:'wd-tag',text:'Preview'}):null);
        b.addEventListener('click',()=>choose(w.id));group.append(b);
        pick.append(el('option',{value:w.id,text:`${w.name}${w.preview?' · Preview':''}`}));}
      pick.addEventListener('change',()=>choose(pick.value));
      old.after(group,pick);old.hidden=true;}
    renderWorlds();
  }
  async function choose(id){
    const w=worlds.find(x=>x.id===id);if(!w||busyWorld)return;
    busyWorld=id;renderWorlds();
    try{
      if(w.family){
        // The family first (the static mode then answers the recipe in it), then the living world shows it.
        if(P.state.recipe?.family!==w.family||P.state.world!=='living')await P.recipeAction({type:'family',family:w.family});
        P.setWorld('living');
      }else P.setWorld(w.id);
    }catch(e){ui?.toast?.(`That world could not be shown: ${e.message}`,'warning');}
    finally{busyWorld=null;renderWorlds();}
  }
  function renderWorlds(){
    const now=shown();
    for(const b of document.querySelectorAll('[data-wd-world]')){b.setAttribute('aria-pressed',String(b.dataset.wdWorld===now));b.toggleAttribute('aria-busy',b.dataset.wdWorld===busyWorld);}
    const pick=document.getElementById('wdWorldSelect');if(pick&&now&&pick.value!==now)pick.value=now;
  }
  // Esc never leaves the Stage here (there is no Control Center); it still closes the list of keys, a menu or full screen.
  addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    if(!intro.hidden){quietBtn.click();e.stopImmediatePropagation();e.preventDefault();return;}
    if(document.fullscreenElement||document.querySelector('.modal-backdrop,.menu')||document.getElementById('stageKeys')?.hidden===false)return;
    e.stopImmediatePropagation();e.preventDefault();
  },true);
  // ---- Start -------------------------------------------------------------------------------------------------------
  S.ready.then(async m=>{
    let catalog=null;try{catalog=await (await fetch('/api/catalog')).json();}catch{}
    const name=id=>(catalog?.families?.[id]?.name||catalog?.previews?.[id]?.name||NAMES[id]||id).replace(/\s*\(preview\)$/i,'');
    worlds=[...Object.keys(m.recipe.families).map(id=>({id,family:id,name:name(id),preview:(m.recipe.previewFamilies||[]).includes(id),about:ABOUT[id]||''})),
      {id:'construct',family:null,name:NAMES.construct,preview:false,about:ABOUT.construct},{id:'city',family:null,name:NAMES.city,preview:false,about:ABOUT.city}];
    for(const w of worlds)w.short=w.name.replace(/^The /,'');
    try{const [dom,icons]=await Promise.all([import('../ui/dom.js'),import('../ui/icons.js')]);ui={toast:dom.toast,icon:icons.icon};}catch{}
    const observe=()=>adapt(chrome.querySelector('.stage-chrome-ui'));
    new MutationObserver(observe).observe(chrome,{childList:true});observe();
    // The introduction's first control receives focus (the page opens on it).
    startBtn.focus({preventScroll:true});
  }).catch(e=>{
    intro.querySelector('.wd-actions').replaceChildren(el('div',{class:'callout danger'},el('div',{class:'callout-body',text:`The recording could not be loaded (${e.message}). Reload the page.`})));
  });
})();

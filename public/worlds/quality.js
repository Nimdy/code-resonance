// Auto quality: how the world host (host.js) adapts live playback's resolution to the machine, as a pure policy.
// Live playback in Auto measures the presented frame rate (wall clock) over half-second windows and moves between the
// levels with hysteresis (docs/QUALIFICATION.md, "Auto quality"):
// - down after `downAfter` s of windows under `slow` fps, to the first level whose relative pixel cost (`cost`) is
//   expected to reach `hold` fps (at least one level: MSAA alone rarely rescues a frame at 18 fps); under `verySlow`
//   fps for `jumpAfter` s, at once to the level expected to reach `target` fps;
// - where the browser measures the GPU time of a frame, slow frames lower the level only while the GPU accounts for
//   at least `gpuShare` of the frame time: frames slowed by the processor or by another program are not made faster by
//   fewer pixels (they count towards `degraded` instead when under `unusable` fps). But where neither the timed GPU work
//   nor the main thread's own work (update and draw, when the host reports it) accounts for `accounted` of a slow
//   frame, the rest is GPU or presentation work the timer does not see (the D3D12 translation layer at 1920x1080:
//   Stellar Forge timed at 21 ms of 52 ms frames, 60 fps at 75 % resolution): fewer pixels do help, the level steps
//   down, and from then on the GPU time is not trusted to predict the level above (the frame rates seen are);
// - up one level only after `upAfter` s in which the level above is expected to reach `target` fps: from the GPU
//   time when the browser measures it (and frames not slow now), otherwise from the frame rate (at the display's
//   refresh rate, `capped`, no headroom is visible in it) and from what was seen at the levels left for slowness in
//   the last `memory` s — or only the last `recheck` s when the current level runs over `stale`× what that memory
//   predicts for it (the machine was busy then: another program, a build; or the pixel-cost model does not fit this
//   GPU, which only a later attempt can tell);
// - a level that turns slow within `probation` s of stepping up to it was a failed attempt: back one level (to the
//   level that held), and that level waits three times longer before it is tried again (at most `upMax` s); a level
//   held through its probation halves its wait again;
// - frames during `start` s after creation and `settle` s after a change (shader compilation, new render targets)
//   are not measured; a single gap over `pause` s is a pause (hidden tab, stage not shown), not a slow frame;
// - `degraded`: under `unusable` fps for `unusableAfter` s at the lowest level (or at a fixed level chosen by the
//   viewer): no level makes this machine's WebGL usable. It clears after `recoverAfter` s at `slow` fps or better.
// Pure (time passed in, seconds) so the logic is unit-tested (tests/adaptive-quality.test.js).
export const AUTO_QUALITY=Object.freeze({window:.5,slow:24,hold:27,downAfter:2,verySlow:12,jumpAfter:1,target:30,capped:55,upAfter:20,upMax:600,probation:10,
  memory:120,stale:1.2,recheck:20,gpuShare:.5,accounted:.6,start:1.5,settle:.75,pause:1,unusable:8,unusableAfter:5,recoverAfter:10,cost:Object.freeze([1.35,1,.5625,.3025])});
export function createQualityGovernor({levels=4,floor=0,level=floor,adaptive=true,config={}}={}){
  const C={...AUTO_QUALITY,...config},top=levels-1,clampLevel=x=>Math.max(0,Math.min(top,Math.round(Number(x)||0)));
  floor=clampLevel(floor);level=adaptive?Math.max(floor,clampLevel(level)):floor;
  let last=null,longGap=false,frames=0,span=0,settle=C.start,slowFor=0,verySlowFor=0,upFor=0,unusableFor=0,recoverFor=0;
  let holds,seen,sinceUp=Infinity,proving=false,fps=null,degraded=false,changes=0,blind=false;
  const forget=()=>{holds=Array(levels).fill(C.upAfter);seen=Array(levels).fill(null);sinceUp=Infinity;proving=false;blind=false;};forget();
  const restart=()=>{frames=0;span=0;slowFor=0;verySlowFor=0;upFor=0;unusableFor=0;recoverFor=0;};
  function to(next,reason,now,f){
    const from=level;
    if(next>from){seen[from]={f,at:now};
      if(sinceUp<C.probation){holds[from]=Math.min(C.upMax,holds[from]*3);next=from+1;reason='failed-step-up';}
      sinceUp=Infinity;proving=false;}
    else{sinceUp=0;proving=true;}
    level=next;changes++;restart();settle=C.settle;
    return {from,to:next,reason};
  }
  return {
    get level(){return level;},get fps(){return fps;},get degraded(){return degraded;},get changes(){return changes;},get adaptive(){return adaptive;},
    get gpuTimerBlind(){return blind;},
    hold(l){return holds[clampLevel(l)];},
    // The viewer's choice changed: a fixed level (or Auto's floor) and whether to adapt. Everything is measured anew.
    configure({floor:f,adaptive:a}={}){if(f!==null&&f!==undefined&&Number.isFinite(Number(f))){floor=clampLevel(f);level=floor;}if(typeof a==='boolean')adaptive=a;
      last=null;longGap=false;restart();settle=C.settle;degraded=false;fps=null;forget();},
    // One presented frame at `now` (seconds), with the GPU time per frame (ms) when known and the main thread's own
    // work per frame (ms) when known. Returns {from, to, reason} when the level changes, otherwise null.
    frame(now,gpuMs=null,cpuMs=null){
      if(last===null){last=now;return null;}
      const dt=now-last;last=now;if(!(dt>0))return null;
      if(dt>C.pause&&!longGap){longGap=true;frames=0;span=0;return null;}
      longGap=dt>C.pause;
      sinceUp+=dt;
      if(settle>0){settle-=dt;return null;}
      frames++;span+=dt;if(span<C.window)return null;
      const f=frames/span,w=span;frames=0;span=0;fps=fps===null?f:fps+(f-fps)*.5;
      const timed=gpuMs>0,share=timed&&gpuMs>=C.gpuShare*1000/f;
      const unseen=timed&&!share&&Number.isFinite(cpuMs)&&cpuMs>=0&&gpuMs+cpuMs<C.accounted*1000/f;
      if(unseen&&f<C.slow)blind=true;
      const gpu=timed&&!blind,gpuBound=!timed||share||unseen;
      slowFor=f<C.slow&&gpuBound?slowFor+w:0;verySlowFor=f<C.verySlow&&gpuBound?verySlowFor+w:0;
      unusableFor=(!adaptive||level>=top||!gpuBound)&&f<C.unusable?unusableFor+w:0;
      if(unusableFor>=C.unusableAfter)degraded=true;
      recoverFor=degraded&&f>=C.slow?recoverFor+w:0;if(recoverFor>=C.recoverAfter){degraded=false;recoverFor=0;}
      if(!adaptive)return null;
      if(proving&&sinceUp>=C.probation&&f>=C.slow){proving=false;holds[level]=Math.max(C.upAfter,holds[level]/2);}
      const down=goal=>{const budget=C.cost[level]*f/goal;let n=level+1;while(n<top&&C.cost[n]>budget)n++;return n;};
      if(level<top&&verySlowFor>=C.jumpAfter)return to(down(C.target),'very-slow',now,f);
      if(level<top&&slowFor>=C.downAfter)return to(down(C.hold),'slow',now,f);
      if(level<=floor){upFor=0;return null;}
      const above=level-1,up=C.cost[above]/C.cost[level];
      const remembered=()=>seen.every((s,k)=>!s||k>above||s.f*C.cost[k]/C.cost[above]>=C.target||now-s.at>(f>C.stale*s.f*C.cost[k]/C.cost[level]?C.recheck:C.memory));
      const room=gpu?f>=C.slow&&gpuMs*up<=1000/C.target:(f>=C.capped||f/up>=C.target)&&remembered();
      upFor=room?upFor+w:0;
      if(upFor>=holds[above])return to(above,'headroom',now,f);
      return null;
    }
  };
}

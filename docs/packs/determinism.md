# Determinism contract

Films are rendered frame by frame, replays can seek anywhere, and the same moment must look the same however you got
there. A world is correct when the frame at performance time `t` depends only on:

1. the recipe (your parameters for this project, its palette and seed);
2. the structure at `t` (`sdk.model`) and the director's commands and lasting record up to `t`;
3. the agent presences at `t`;
4. the frame: `t`, `tsec`, `tview`, `beat`, `barPhase`, `mood`, `quality` (films always render at quality 0).

Rules that follow:

- **Time from the frame only.** Never `Date.now()`, `performance.now()` or animation-frame timestamps. Shader time is
  `frame.tsec` (seconds since the recording's start: small numbers, full float32 precision); durations use
  `tsec / sdk.speed()`.
- **Randomness from seeds only.** `sdk.random(key)` or `sdk.util.hash` / `rand` of stable keys (ids). In the pack worker,
  `Math.random` and `Date.now` are replaced by values derived from the frame time, so an accident stays deterministic,
  but do not rely on that.
- **Closed forms over accumulation.** Compute positions and effects as functions of time since an event (store the
  event's time, not a running value). Springs that converge (the camera rig) are fine; integrating `dt` into state is not.
- **Seek safety.** After a seek the host calls `onPrime(t, tsec)`: clear every transient effect and rebuild lasting
  transformations from `sdk.director.lasting()` (one entry per verified milestone and subject, with its count and
  recent times). Never rebuild lasting state from `sdk.director.commands` (recent commands only).
- **Structure from the model.** Rebuild when `sdk.model.version` changes; derive layout from stable keys (ids, order of
  appearance), never from iteration order of something that changes.

The compatibility test renders the same moment in two browser sessions, the second after first playing another part of
the recording, and requires byte-identical frames. The long-history machinery behind the director (checkpoints,
exact re-folds) is described in `docs/WORLDS.md` ("Long histories"); a world only sees its results.

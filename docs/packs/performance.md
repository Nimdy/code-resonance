# Performance

A pack declares a `budget` in its manifest: what it promises at 1920×1080, full quality. The compatibility tests
measure the total rendering cost in the live player on the largest available recorded project and fail the pack when
it exceeds its budget:

| Measure | Meaning |
|---|---|
| `drawCalls` | draw calls of your scene |
| `passes` | all draw calls of the frame: background, scene, your post passes, bloom chain, grade |
| `triangles`, `points` | primitives drawn |
| `updateMs` | CPU time of `update` + camera per frame (moving average) |
| fps | frames rendered per second where the world renders (the pack worker counts its own frames) |
| `gpuMs` | GPU time of the whole frame, where the driver offers timer queries (SwiftShader and many integrated GPUs do not) |

Defaults when a manifest declares no budget: 40 draw calls, 40 passes, 2,000,000 triangles, 500,000 points, 8 ms.

In the player, a pack that stays above 1.25× any declared budget figure for ten seconds gets a notice (a message on
screen, also shown on the Stage and in the Visual Studio); it keeps running: adaptive quality and the watchdog below
deal with real trouble.

## Adaptive quality

Live playback at the *Auto* quality measures the presented frame rate and lowers the level when frames are slow:
after 2 s under 24 fps, to the first level expected to reach 27 fps, and after 1 s under 12 fps, at once to the level
expected to reach 30. Level 1 drops MSAA, level 2 renders at 75 % resolution, level 3 at 55 %. It climbs back one level
only after 20 s in which the level above is expected to hold 30 fps, and waits longer after a failed attempt. The rule
and its thresholds: [QUALIFICATION.md › Auto quality](../QUALIFICATION.md#auto-quality-desktop-milestone).
`frame.quality` tells your world the level: at 2 and above, halve particle counts and expensive loops (the reference
world halves its sand). Films always render at level 0, frame-exact. Viewers can fix the level instead (Settings › This
device, or on the Stage: Auto, High, Medium, Low, Lowest); a fixed level does not adapt.

## Live delivery and the watchdog

Since SDK 1.1 your world renders in a worker and every frame is acknowledged to the player:

- **At most one frame in flight.** When your world is slower than the display, the player skips presentation frames
  (counted) instead of queueing them, and the worker drops a live frame that a newer one has made obsolete. Your world
  never falls behind by more than a frame.
- **Events are never skipped.** Structure, cues, intents, priming and recipe changes are delivered in order, always;
  the qualification checks that every one sent reaches the world while frames are being skipped.
- **Films are exact.** A film frame is awaited at its exact time; if it does not arrive within 60 s the film fails with
  an explicit error (no frame is substituted).
- **The watchdog.** The pack is stopped (the user is told why, the built-in identity takes over, the recipe keeps your
  pack, and **Retry** runs it again; nothing restarts on its own) when: a frame is not acknowledged within 6 s; fewer than
  20 frames arrive in 20 s (under 1 fps); your code throws; the GPU context is lost; the worker floods the player with
  more than 1,000 messages a second; or the frame navigates. A hidden tab is never judged (browsers throttle it).

Measured with the testing fixtures in `packs/testing/` (`qualification/visual/robustness.qual.js`): see
`docs/QUALIFICATION.md`.

## Habits that keep worlds fast

- Instancing and point buffers (`sdk.buffers.instanced`, `sdk.buffers.points`): one draw call per kind of thing. The
  three built-in families draw 7–13 scene calls for a 450-file project.
- Put motion in shaders as functions of time; upload attributes only when they change (`flush` marks dirty attributes).
- Pool transient effects; never create geometry per event.
- Rebuild only when `sdk.model.version` changes, and keep rebuilds linear in the structure.

Reference numbers (measured, not targets): see `docs/QUALIFICATION.md` ("Visual packs") for the reference packs on
SwiftShader and on an AMD integrated GPU.

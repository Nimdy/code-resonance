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
| fps | frames rendered per second where the world renders (the pack frame counts its own frames) |

Defaults when a manifest declares no budget: 40 draw calls, 40 passes, 2,000,000 triangles, 500,000 points, 8 ms.

## Adaptive quality

Live playback lowers quality when frames are slow (more than ~36 ms for three seconds): level 1 drops MSAA, level 2
renders at 75 % resolution, level 3 at 55 %; it climbs back after twenty fast seconds. `frame.quality` tells your world
the level: at 2 and above, halve particle counts and expensive loops (the reference world halves its sand). Films always
render at level 0, frame-exact.

## Habits that keep worlds fast

- Instancing and point buffers (`sdk.buffers.instanced`, `sdk.buffers.points`): one draw call per kind of thing. The
  three built-in families draw 7–13 scene calls for a 450-file project.
- Put motion in shaders as functions of time; upload attributes only when they change (`flush` marks dirty attributes).
- Pool transient effects; never create geometry per event.
- Rebuild only when `sdk.model.version` changes, and keep rebuilds linear in the structure.

Reference numbers (measured, not targets): see `docs/QUALIFICATION.md` ("Visual packs") for the reference packs on
SwiftShader and on an AMD integrated GPU.

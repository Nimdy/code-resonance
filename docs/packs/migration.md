# SDK 1.3, 1.2 and 1.1: what changed, and migrating

## SDK 1.3: the graduated worlds and `grown`

SDK 1.3 names two things that became available in Code Resonance 0.8.1 and changes nothing else: Synaptic
Storm, Fractal Continuum and Temporal Terrain as the `base` of a declarative or shader pack (`synaptic-storm`,
`fractal-continuum`, `temporal-terrain`), and the project trait `grown` for a world pack's parameters (`from`), the share
of the project's symbols created while it was observed (generator 5). A pack that uses either declares `"sdk": "^1.3"`,
so that an older receiver refuses it with *needs SDK 1.3 or later* instead of an unknown family or trait. A pack that
uses them and declares less still installs, with a warning that says what to declare (`node scripts/pack.js validate`
and the Visual Packs import show it). The Artist Studio's *Export* writes `^1.3` for a composition over one of the
three and `^1.2` otherwise. Every pack written for `^1.0`, `^1.1` or `^1.2` runs unchanged, and `sdk.version` is
`'1.3.0'` (`sdk.api` stays `1`).

## SDK 1.2: creations and finishes

SDK 1.2 adds two optional, data-only fields and changes nothing else: `declarative.composition` (an Artist Studio
composition, see [the manifest](manifest.md)) and `technique.finish` (`classic`, `clean`, `cinematic`, `dreamlike`). A
pack that uses either declares `"sdk": "^1.2"`; every pack written for `^1.0` or `^1.1` runs unchanged, and `sdk.version`
is `'1.2.0'` (`sdk.api` stays `1`). World and shader packs do not have to know about compositions.

# SDK 1.1: what changed, and migrating from 1.0

SDK 1.1 keeps the 1.0 contract (manifest schema `code-resonance.pack.v1`, the World API, the `sdk` object, the shader
pack interface) and changes where code packs run. Packs that declare `"sdk": "^1.0"` run unchanged on 1.1: the three
reference packs still declare `^1.0` and pass the compatibility tests on 1.1. The starter templates for code packs now
declare `^1.1`.

## What changed

| | SDK 1.0 | SDK 1.1 |
|---|---|---|
| Where world and shader pack code runs | the pack frame's page | a dedicated worker inside the pack frame |
| Canvas | `HTMLCanvasElement` in the frame | `OffscreenCanvas` transferred to the worker |
| `document`, `window`, DOM APIs | present in the frame (never part of the SDK) | absent |
| Frame delivery | best effort | every frame acknowledged; at most one in flight; slow worlds get presentation frames skipped, never events |
| Watchdog | exceptions, frame navigation | also: no answer for 6 s, under 1 fps for 20 s, GPU context loss, message floods, approval revoked, files changed |
| Live recording | built-in worlds only | every kind of pack (the worker composites the frame and its labels) |
| New in `sdk` | | `sdk.util.canvas(w, h)`: an `OffscreenCanvas` for 2D-drawn textures |
| `sdk.version` | `'1.0.0'` | `'1.1.0'` (`sdk.api` stays `1`) |

## Migrating

Most packs need nothing. Check your world for anything that reached outside the SDK into the page:

- **`document.createElement('canvas')`** (for a `CanvasTexture`, a gradient, text): use `sdk.util.canvas(w, h)`, or
  `new OffscreenCanvas(w, h)` if you must support 1.0 hosts as well (it exists there too).
- **`new Image()` / `<img>`**: declare the file under `textures` in the manifest and use `await sdk.assets.image(path)`
  (an `ImageBitmap`, as in 1.0).
- **`window.devicePixelRatio`, `innerWidth`, resize listeners**: the host sizes the renderer; read sizes from
  `sdk.renderer.getSize(new sdk.THREE.Vector2())` if you need them.
- **`requestAnimationFrame`, timers for animation**: never needed (and never deterministic); animate in `update(frame)`
  from the frame's times, as [determinism](determinism.md) already required.

Then, if you use `sdk.util.canvas`, declare `"sdk": "^1.1"`; otherwise you may keep `^1.0`. Run
`node scripts/pack.js test <dir>`: the tests run your pack in the 1.1 runtime.

## Why

A pack that hangs inside a frame's page can block the player's own page in Chromium (measured during this work). In a
worker it blocks only itself: the player stays responsive, notices the silence and stops the pack. A worker also has
no DOM, cannot navigate the frame and has no WebRTC, which removes the ways out of the frame that a content policy
cannot close for a page.

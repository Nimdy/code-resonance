# World API (SDK 1; current 1.2)

A world pack's entry module (`world.entry` in the manifest) is one self-contained ES module. It must not import
anything (the frame refuses it, and validation rejects it): everything comes through `sdk`.

**Where it runs.** In a dedicated worker inside the isolated pack frame (SDK 1.1). There is no `document` and no
`window`: the renderer draws into an `OffscreenCanvas`, images arrive as `ImageBitmap` (`sdk.assets.image`), and a 2D
surface for a texture is `sdk.util.canvas(w, h)` (an `OffscreenCanvas`; `new THREE.CanvasTexture(canvas)` takes it).
Each frame you render is acknowledged to the player; if your world is slow the player skips presentation frames (your
events are never skipped), and a world that stops answering is stopped (see [Performance](performance.md#live-delivery-and-the-watchdog)).

```js
export function createWorld(sdk){
  // build GPU resources once; return the world
  return {rebuild, update, cameraGoal, effect, dispose /* + optional functions below */};
}
```

The three built-in families (`public/worlds/stellar.js`, `biosphere.js`, `cathedral.js`) implement exactly this
interface; read them for complete examples of instancing, shaders, labels and lasting state.

## Functions your world implements

| Function | Required | Called | Contract |
|---|---|---|---|
| `rebuild()` | yes | when the structure may have changed | mark your structure stale; rebuild it from `sdk.model` (the built-ins rebuild in `update` when `sdk.model.version` changed) |
| `update(frame)` | yes | every frame, before the camera | animate from `frame` and your state; never read wall-clock time |
| `cameraGoal(frame)` | yes | every frame | `{target: Vector3, distance, azimuth, elevation, fov?, omega?}`; a critically damped rig glides there |
| `effect(cmd, frame)` | yes | when the director emits a command | express it; `cmd.effect` is your vocabulary's name (manifest `effects`) |
| `dispose()` | yes | when the world is switched away | release every geometry, material and texture you created (the frame is also destroyed) |
| `afterCamera(frame)` | | after the camera moved | camera-dependent work |
| `background(frame)` | | every frame | a full-screen `ShaderMaterial` drawn at half resolution behind the scene (use `sdk.glsl.BACKGROUND_VS`) |
| `grade(frame)` | | every frame | `{bloom, threshold, exposure, contrast, saturation, vignette, grain, flash, waves, lift, tint}`; the recipe's technique is applied on top |
| `describe(cmd, frame)` | | for callouts and banners | `{text, sub, position, color, banner, bannerSub}`; generic words and `sdk.name(id)` only |
| `agentPosition(id, frame)` | | for agent chips | a `Vector3` or null |
| `agentColor(agent)` | | for agent chips | a CSS colour |
| `subsystemLabels(frame)` | | explorer mode | `[{position, text, sub}]` |
| `status(frame)` | | stream mode lower third | a short string |
| `pick(x, y, camera, frame)` / `inspect(id, frame)` | | explorer clicks; the Control Center's hover card (up to ten times a second) | an id; then `{position, text, sub}` (generic words and `sdk.name(id)` only; keep them cheap). The pack frame takes no pointer input: the player asks your worker |
| `onPrime(t, tsec)` | | after a seek | clear transient effects; rebuild lasting state from `sdk.director.lasting()` |
| `onDelta(delta, start, end)` / `onCue(cue, t)` | | as the timeline plays | rarely needed: `sdk.model` already applies them |
| `stats()` | | by the player and the tests | a flat object of counts |

## The `frame`

`{t, tsec, tview, dt, beat, barPhase, mood, energy, activity, phase, unlocks, agents, overrides, quality}`

- `t`: performance time (ms); `tsec`: seconds since the recording's start (use it for shader time); `tview`:
  `tsec / speed` (use it for durations, so an 8× replay does not run effects 8× faster); `dt`: seconds since the last
  frame (springs only; never accumulate state with it).
- `beat` (1 on the beat, decaying), `barPhase` (0–1 through the bar), `mood` `{section, energy, tempo}`, `energy`.
- `activity` 0–1, `phase` `'idle' | 'active' | 'milestone'`.
- `unlocks`: `[{name, level}]`, your ambient layers in manifest order, fading in after each verified milestone.
- `agents`: presences `{id, number, voice, state, display, label, activity, fileId, home, since, arrived, alpha, busy}`.
- `overrides`: the viewer's settings `{intensity, motion, atmosphere}` (and `labels` only when the project chose its own information mode; the mode on screen is applied by the host, a pack does not need it); `quality`: adaptive level 0–3 (at 2
  and above, halve your particle counts).

## The `sdk` object

| Member | What it is |
|---|---|
| `version`, `api` | `'1.2.0'` (`'1.0.0'` or `'1.1.0'` on older runtimes), `1` (unchanged since 1.0) |
| `THREE` | three.js r170 |
| `scene`, `camera`, `renderer`, `film` | your scene, the camera the rig drives, the renderer (in the pack worker, on an `OffscreenCanvas`), whether a film is rendering |
| `recipe`, `params`, `palette` | the recipe; your declared parameters drawn for this project; palette colours as `THREE.Color` (`primary`, `secondary`, `accent`, `highlight`, `deep`, `haze`, `warning`, `valid`) |
| `model` | `districts`, `modules`, `symbols`, `links` (Maps), `stateAt(module, t)`, `bornAt(x)`, `alive(x, t)`, `districtBorn(d)`, `symbolsAt(module, t)`, `totals(t)`, `epoch`, `version`. Treat as read-only |
| `director` | `commands` (recent), `lasting()`, `attentionAt(t, minTier)`, `unlockedAt(t)`, `activityAt(t)`, `phaseAt(t)` |
| `agents` | `list(t)`, `presence(id, t)`, `trail(id, t, ms)`, `name(presence)` |
| `speed()`, `name(id)`, `quality` | replay speed; a public name for a subsystem (the user's alias or a generated one); current adaptive level |
| `random(key)` | a seeded generator: the same project, variant and key always give the same sequence |
| `assets.text(path)`, `assets.image(path)` | files you declared in the manifest (`shaders`, `textures`) |
| `glsl` | `NOISE` (gradient noise, `fbm3`, `fbm5`, `h11`), `ORBIT`, `BACKGROUND_VS` |
| `util` | `clamp`, `lerp`, `smooth`, `easeOut`, `easeInOut`, `hash`, `rand`, `rng`, `color`, `orbitPos`; `canvas(w, h)` (1.1): an `OffscreenCanvas` for textures |
| `buffers` | `instanced(geometry, layout, capacity)`, `points(layout, capacity)`: attribute storage that grows by doubling and disposes old GPU buffers; `pool(n, make)` |

## Director commands

`{effect, intent, id, tier, requestedTier, at, magnitude, scale, duration, subject, detail, evidence, count}`.
The director decides size from evidence, the same for every world: routine effects coalesce, structural ones cool
down, milestones spend spectacle tokens, the viewer's intensity scales everything. Map all twelve effect intents in
your manifest; you must map `validation.failed` and `milestone.achieved`. A failure must never look like a success.

## Shader packs

A shader pack's `background` and `post` files are fragment shaders. Uniforms available to both: `uTime` (view
seconds), `uBeat`, `uBar`, `uEnergy`, `uActivity`, `uRes`, `uCam`, `uInv` (inverse view-projection), the palette
(`uPrimary`, `uSecondary`, `uAccent`, `uHighlight`, `uDeep`, `uHaze`, `uWarning`, `uValid`) and the pack's own
`uniforms` (drawn per project). Post passes also get `tInput`, the HDR image so far. The optional effects module:

```js
export function createEffects(sdk){
  return {effect(cmd, frame){}, update(frame){}, onPrime(t){}, dispose(){}};
}
```

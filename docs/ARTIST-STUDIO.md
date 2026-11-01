# The Artist Studio

The Artist Studio (`#/artist`) makes original visual compositions without code: procedural layers over one of the six
built-in worlds, or over the minimal artist canvas, that react to the music and to the project's real engineering
events. A composition is data (`public/composition.js`); nothing in it is ever evaluated. Artists who want unrestricted
rendering code use the Visual Pack SDK (shader and world packs), which keeps its approval and isolation.

## What is what

| Term | What it is | Where it lives |
|---|---|---|
| **World identity** | a project's saved visual universe: its family, genome, tuning (the Visual Recipe) | `<data>/projects/<hash>/recipe.json` |
| **Composition** | an artist-made stack of layers, mappings, a finish, world values and a music profile | `<data>/compositions.json` (My creations) |
| **Applied composition** | the composition a project shows, copied into its identity (`recipe.composition`) | the project's recipe |
| **Look** | a declarative pack that retunes a world's colours, materials and light | an installed pack |
| **Creation** | a composition exported as a data-only pack, to share | a `.zip` / an installed pack |
| **Music profile** | style and performance profile (mood, evolution, rhythm …) a composition may ask for | the composition; applied to the project's music preferences |

A composition never holds a project's identity: applying "Neon Mycelium" to two projects draws the same layers, finish
and palette on two different worlds, each grown from its own code and events.

## The screen (1920 × 1080)

- **Left — Library and Layers.** *My creations* (the receiver's library, with an *Imported creations* section for
  installed creation packs), the four *Starters* and the blank canvas, and the *Worlds* to start from. Under it the
  layer stack, listed in drawing order and grouped by depth: **In front** (never hidden by the world), **Integrated**
  (depth-tested inside the world) and **Behind**; the base world (or canvas) is the bottom row. Each layer can be shown
  or hidden, soloed, moved (arrows, Alt+↑/↓, or drag; moving past the edge of a group changes its depth), renamed,
  duplicated and removed (with undo).
- **Centre — the Stage.** The real stage, previewing the working copy on the selected project's structure, music and
  recorded events. Under it, **Reacts to** (the selected layer's mappings, or the whole composition's: camera and
  finish) and **Composition** (base, finish, music profile, canvas colours). At the foot: the rendering budget, what
  the stage shows, and Versions, Duplicate, Export, Save as…, Cancel, Save and **Apply to project**.
- **Right — the selected layer.** Placement (anchor, depth, blend, opacity; an XY pad for a fixed point), then Form,
  Appearance and Motion, each with its few strongest controls first and the rest under *More*; a seeded *Variation*.
  The base world shows its palette, a few world values, digital life (including Music influence 0 / 1 / 2) and every
  other tunable value under *All world values*; the canvas shows its background, horizon and camera.

Anchors place a layer where the world has something to say: the world centre, every subsystem (one instance each, from
the real layout), one of the largest subsystems, where the work is (active region), structural nodes, the environment
boundary, the camera (screen-relative) or a fixed point. There is no free-form dragging in the 3D world: a fixed point is
set on a plan seen from above and a height.

## Mappings: what reacts

A mapping takes one signal (0..1, deterministic for a performance) and changes one numeric property of its layer:
strength with direction (negative: the other way), a response curve (linear, smooth, sharp, peaks), smoothing in seconds
and the part of the property's range it may use. Each one is said in words under it: *"Glow rises with the music's
dynamics"*, *"Intensity swells after a verified milestone"*.

- **Music**: beat, bar, phrase, section change, transition, energy, harmonic tension, melody, rhythm, release, dynamics,
  density — from the score's own expression on the performance clock, never from analysing the audio.
- **Engineering**: activity, creation, removal, failure, recovery, verified milestone, agents — only from the canonical
  intents the receiver interprets. A failure never reads as a milestone; nothing is inferred or invented.
- **Environment**: the digital life's density, field energy, currents, disturbance, coherence and trails (or the
  composition's own particle layers on the canvas).

New layers start with one tasteful mapping, and an empty list offers one-click suggestions (*Pulse on the beat*,
*Answer verified milestones* …).

## Preview, save, apply, cancel

- **Preview** is local to the window: every edit (debounced, about 150 ms) asks the receiver for a candidate identity
  (`POST /api/recipe/preview` with a `composition` action, never stored) and shows it on this window's stage. The OBS
  view and other windows keep the saved look. While previewing, recording is blocked (a recording shows what is saved);
  a composition's music profile is heard at the next bar, in this window only.
- **Save** writes the working copy to My creations (`POST /api/compositions`, `update` with the version it was opened
  at). Each save keeps the version before it — the last five are kept — so a change never destroys the previous one.
  **Versions** brings one back (the current one moves into the history). **Save as…** and **Duplicate** make a new one.
  A composition saved meanwhile in another window is never overwritten silently: load theirs, save yours as a copy, or
  replace it (theirs stays in the history).
- **Apply to project** saves first if needed, then applies the composition to the selected project as one recipe action
  (`{type:'composition'}`) against the identity revision the preview started from; a change made meanwhile in another
  window asks whether to reload or apply on top. When the composition names another built-in world, the project switches
  to it; its world values and finish are applied through the ordinary tuning (only tunable, valid values); its music
  profile becomes the project's music preferences (key, mode and motif stay the project's own). The project's digital
  life and structure stay. Every window, the OBS view, recordings and replays then show it.
- **Cancel** discards the unsaved changes (after asking) and shows the project's saved look again. Leaving the studio
  stops the preview; the working copy is kept for the rest of the page's life, never in browser storage.

## Share: export and import

**Export** turns a saved composition into a data-only visual pack (`kind: "declarative"`, `sdk: "^1.2"`, or `"^1.3"`
over Synaptic Storm, Fractal Continuum or Temporal Terrain, an id
`creator.<name>-<6 hex>`, the author name and license the artist chooses): `pack.json` with the composition and a
README that describes every layer and mapping in words. *Inspect contents* shows both files exactly; *Download .zip*
writes them with a small stored-entry ZIP writer (`public/ui/zip.js`). The receiver checks the manifest as an import
would before handing it out. Nothing of a project — its name, files, paths, structure, identity, recipe — nor anything
about the computer is ever part of it.

Another installation imports it through **Visual Packs → Import a pack** (zip or folder), sees *Data only*, and installs
it without approval. It appears under *Imported creations*: **Use** applies it to the selected project, **Open in Artist
Studio** copies it into My creations for editing.

## Limits and safety

- At most 8 layers and a rendering budget of 100 per composition (a particle layer's cost grows with its count and
  trails); a change past either is refused and said, never silently dropped. 6 mappings per layer, 4 for the whole
  composition, 48 world values, 100 compositions in the library.
- Only the six allowlisted layer types and the listed signals and targets exist; values are clamped and unknown keys
  dropped; names are text (control characters and angle brackets are removed).
- A creation pack can contain no code file; unknown layer types, unknown signals and oversized budgets are rejected at
  import.

## Routes

`#/artist` (the working copy, or the composition last opened here), `#/artist/new/<starter>`,
`#/artist/from/<family>` (`fractal-biosphere`, `stellar-forge`, `machine-cathedral` or `canvas`),
`#/artist/edit/<composition id>`, and `#/artist/project` (the composition the selected project shows).

## Receiver API

| Route | |
|---|---|
| `GET /api/compositions` | the library: every composition with its version and a summary of its previous versions |
| `POST /api/compositions` (control capability, `ifRevision`, 64 KiB) | one action: `create` (`starter` or `composition`, `name`, `origin`), `update` (`id`, `composition`, `ifVersion`), `rename`, `duplicate`, `delete`, `restore` (`id`, `version`); a new composition's id is in `created` |
| `GET /api/compositions/export?id&author&license&description` | the export: `{id, name, version, folder, manifest, files:[{path, data (base64), size}]}` |
| `POST /api/recipe` `{action:{type:'composition', composition}}` | apply a composition on a project (`composition: null` removes it) |

The change feed announces `compositions` with the library's revision, which its `hello` also carries.

## How a composition is rendered

An artist composition is a stack of procedural layers over a base (one of the six built-in worlds, or the artist
canvas; Synaptic Storm, Fractal Continuum and Temporal Terrain since generator 5 graduated them), with a finish, optional world tuning and music profile, and reactive mappings from deterministic signals to
bounded parameters. The data model is `public/composition.js` (allowlisted types, clamped values, nothing evaluated
as code). This document is the renderer's contract: how a composition is drawn, what it can anchor to, what it can
respond to, and what is deterministic.

### Rendering

| Module | What |
|---|---|
| `public/worlds/layers.js` | The runtime a world host owns for a composition: the layer stack, anchors, mappings, clocks, depth and blend state, global mappings, stats. |
| `public/worlds/layers-gl.js` | One renderer per layer type (instanced or buffer geometry, one `ShaderMaterial`). |
| `public/worlds/layers-forms.js` | The procedural forms: fractals, structures, flow fields (pure, seeded). |
| `public/worlds/layers-swarm.js` | Particle populations (pure, fixed step, generations). |
| `public/worlds/layers-signals.js` | Every mappable signal (pure). |
| `public/worlds/canvas.js` | The artist canvas world. |

Layers are drawn **inside the world's own HDR scene pass**: the finish (tone mapping, bloom, halation, optical
aberration, grain) treats them exactly like the world. There is no second renderer and no extra full-screen render
target.

**The host.** `host.setRecipe(next)` keeps the world when only `recipe.composition` changed: the next frame applies
it to the layer runtime (`layers.set`), which matches layers by id. An edit to a layer's appearance or motion only
moves uniforms; an edit to its form (the values marked `live: false` in `composition.js`: fractal depth, branching,
spread and instances; counts; structure detail) rebuilds that one layer; a removed layer releases its geometries and
materials at once. A composition whose base is `canvas` loads `canvas.js` in place of the family's module; moving
onto or off the canvas is a full load. The layer modules load the first time a composition appears; a world without a
composition never loads them and renders exactly as before. Pack worlds never receive compositions (the pack frame's
recipe view does not carry them).

**Depth classes are real.** `behind`: pushed to the far plane in the vertex shader, depth-tested, so everything the
world draws stands in front of it. `world` (integrated): depth-tested with the world, so the world's own forms hide
and reveal it; an opaque solid structure with normal blending also writes depth. `front`: no depth test, drawn after
the world. Blends are premultiplied: add, screen (`src + dst·(1 − src)`, the layer's colour clamped to 1) and
normal. The wording shown with the choice (the Depth control, the stack's depth groups and each layer's badge) is
`DEPTH_WORDS` in `composition-text.js`; an atmosphere layer's badge adds "· screen". An atmosphere behind the world is
a screen-space sky, integrated it is a volume around its anchor, in front it is a veil over the image.

**Layer types.**

| Type | Drawn as | Form (rebuilt when edited) | Live (mappable) |
|---|---|---|---|
| Fractal geometry | camera-facing bands, glowing tips | tree, fern, coral, lightning, spiral; depth, branching, spread, instances | growth (reveals the form from its root, the growing front glows), width, glow, sway, scale, speed, colour, material (filament, crystal, vein: flow pulses run from root to tips) |
| Particle population | two crossfading point sets, trails | count | spread, cohesion, separation, alignment, attraction (negative: a void around the site), speed, lifetime, size, glow, sparkle, trail |
| Ribbons & flow | camera-facing streamline strips | count, field (curl, orbit, spiral, wind) | length, scale, width, taper, turbulence, speed (the field evolves and energy pulses travel downstream) |
| Geometric structure | bands, nodes, bodies, optional solid surfaces | rings (an armillary of tumbling gimbals with graduations), lattice (a crystal with travelling signals), polyhedron (nested geodesic solids), orbits (an orrery whose bodies move faster near the centre), arches (pointed arches with tracery and an oculus); count, detail | radius, thickness, rotation, wobble, glow |
| Atmospheric field | sky quad, ray-marched sphere, or veil | depth class | haze, aurora, gradient, nebula; scale, height, intensity, noise, speed |
| Light accents | sprites | count | glow, pulse (expanding rings), flare (core, anamorphic streak, diffraction spikes), beacon (a vertical beam); size, intensity, falloff, speed |

Every type also has opacity, brightness, scale, hue and speed. Lines never fall under 1.3 pixels wide: a thinner
line fades instead of shimmering. The quality level (Auto included) reduces counts and samples, never correctness:
the finest fractal level, a share of particles and trails, ribbon samples, atmosphere octaves and ray-march steps.
The rendering budget (`LIMITS.budget`, each type's `cost`) bounds what a composition may hold; `layers.stats()`
reports layers, cost, points, segments and draw calls (also in `host.stats().layers`).

### Anchors

A world exposes `world.compose = {camera, scene, anchors(frame)}`; the runtime resolves each layer's anchor to sites
every frame (they move with the world: Stellar's systems turn with the galaxy, Biosphere's organisms grow and sway).

| Anchor | Site |
|---|---|
| `center` | The world's centre at mid-height (forms that grow upward root on the floor). |
| `subsystems` | One per subsystem, largest first: Biosphere organisms (rooted at their base), Stellar star systems, Cathedral precincts, canvas marks. Instances are spread over them; at subsystems a fractal stands beside its subsystem, not inside it. |
| `largest` | The subsystem of that rank. |
| `active` | The director's current subject (or the file an observed agent's tool is working on), followed smoothly; it is placed anew after a seek. |
| `nodes` | Up to 64 structural nodes: branch tips, worlds in orbit, tower tops, modules on the canvas. |
| `boundary` | The world's edge: one great site around it (structures, atmospheres, ribbons), or eight points on it. |
| `camera` | In front of the lens (dust before the camera, a flare fixed in the frame). |
| `point` | A fixed point, -1..1 of the world's extent. |

### Signals

All signals are 0..1 and deterministic for a given performance; none comes from the audio device, so a performance
reads the same muted, unplugged or rendered offline (`layers-signals.js`).

- **Music** (the score's expression on the shared clock, `musical.js`): beat (`pulse`), bar (`barPulse`), phrase
  (`(barInPhrase + phase) / 4`), section change (`onset`), transition, energy, tension, melody, rhythm, release,
  dynamics, density.
- **Engineering** (canonical intents as the director folded them, so exact after any seek): creation
  (`module.created`, `subsystem.created`, `structure.created`), removal (`structure.removed`, `module.removed`),
  failure (`validation.failed`), recovery (`validation.recovered`), milestone (`milestone.achieved`), each through an
  envelope that rises, holds and decays over seconds of view time (stronger with magnitude and with bursts, never past
  1). Failure, recovery and milestone count only verified evidence; a failure is never a milestone and a passing run
  is not a milestone either. Activity is the director's own; agents are the observed presences (busy ones fully).
  No event, no response.
- **Environment**: the ecosystem as shown when digital life is on (gathering over the density grid, speed relative to
  each species' top speed, alignment, disturbance, and field energy and trails relative to their own recent level, so
  a typical moment of any world reads near 0.5), otherwise the composition's own particle populations, otherwise 0.

A mapping adds `amount × curve(signal) × range` to its target and clamps to its min..max (fractions of the range;
negative amounts lower it). Smoothing is exponential per rendered frame (films render frame by frame, so it is exact
for them) and reset by a seek. Composition-level mappings bend the world's camera goal (a slow sway of at most about
12° around the subject and 3° in height, a zoom of at most 30 %) and the grade's bloom (±50 %) and exposure
(±30 %); with nothing mapped both are untouched.

### Determinism

- Forms are pure functions of the layer's seed and values; anchors are the world's own deterministic layout.
- Every layer clock is view time integrated frame by frame (a mapped speed never jumps) and restarts from the
  performance time after a seek.
- Particle populations step at 15 Hz with a counter-based hash for every random choice. Like the digital life's
  replays they live in generations (24 s, warm-started 6 s early, crossfaded over 3 s), and a population's simulation
  reads its mappings at each tick's own performance time, so a seek, or a film's first frame, shows exactly the
  population continuous play reaches (`tests/layers-swarm.test.js` pins a digest and proves it). Environmental
  signals are read as they are shown.
- Two runtimes fed the same frames draw the same layers (`tests/layers-runtime.test.js`).

### The artist canvas

`canvas.js` is a world in its own right, never chosen for a project: only a composition whose base is `canvas` asks
for it. It receives the project's structure, its canonical intents, its observed agents and the music, and shows them
quietly: a sky from the composition's zenith and horizon colours, a floor with a fine polar grid, the project's
subsystems as marks from the Construct's persisted hexagonal site plan (sized by their modules, brighter where the
work is, cooler under failing tests, a warm outer rim where verified milestones were reached), rings on the floor for
canonical events, a light for each observed agent, and a slowly orbiting, almost level camera that verified moments
draw closer. Its settings (`background`, `horizon`, `orbit`, `distance`, `floor`) apply in place. On the canvas the
title card reads "Artist canvas".

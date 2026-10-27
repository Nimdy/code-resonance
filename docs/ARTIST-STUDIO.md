# Artist Studio

An artist composition is a stack of procedural layers over a base (one of the three flagship worlds, or the artist
canvas), with a finish, optional world tuning and music profile, and reactive mappings from deterministic signals to
bounded parameters. The data model is `public/composition.js` (allowlisted types, clamped values, nothing evaluated
as code). This document is the renderer's contract: how a composition is drawn, what it can anchor to, what it can
respond to, and what is deterministic.

## Rendering

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
normal. `composition.depthNote(type, depth)` gives the honest description shown with the choice: an atmosphere behind
the world is a screen-space sky, integrated it is a volume around its anchor, in front it is a veil over the image.

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

## Anchors

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

## Signals

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

## Determinism

- Forms are pure functions of the layer's seed and values; anchors are the world's own deterministic layout.
- Every layer clock is view time integrated frame by frame (a mapped speed never jumps) and restarts from the
  performance time after a seek.
- Particle populations step at 15 Hz with a counter-based hash for every random choice. Like the digital life's
  replays they live in generations (24 s, warm-started 6 s early, crossfaded over 3 s), and a population's simulation
  reads its mappings at each tick's own performance time, so a seek, or a film's first frame, shows exactly the
  population continuous play reaches (`tests/layers-swarm.test.js` pins a digest and proves it). Environmental
  signals are read as they are shown.
- Two runtimes fed the same frames draw the same layers (`tests/layers-runtime.test.js`).

## The artist canvas

`canvas.js` is a world in its own right, never chosen for a project: only a composition whose base is `canvas` asks
for it. It receives the project's structure, its canonical intents, its observed agents and the music, and shows them
quietly: a sky from the composition's zenith and horizon colours, a floor with a fine polar grid, the project's
subsystems as marks from the Construct's persisted hexagonal site plan (sized by their modules, brighter where the
work is, cooler under failing tests, a warm outer rim where verified milestones were reached), rings on the floor for
canonical events, a light for each observed agent, and a slowly orbiting, almost level camera that verified moments
draw closer. Its settings (`background`, `horizon`, `orbit`, `distance`, `floor`) apply in place. On the canvas the
title card reads "Artist canvas".

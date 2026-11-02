# Genesis volume: the art-direction gate (an experiment)

**Status.** A feasibility experiment, not a world and not a milestone. After G1.5 the owner asked whether GENESIS
can be an explorable physical universe rather than an object seen from outside. It should have large interconnected
spaces, coherent cavities, layered surfaces, openings and physically meaningful paths through matter. This document
records the answer, the one alternative representation built to test it, and what it costs. The G1.5 field
(`genesis-field.js`) is unchanged and remains the reference. Nothing here touches the player, an identity, the score
or the music engine.

![Code Resonance's universe, inside the core's hall: the passages its dependencies opened carry light; the regions' walls around](genesis-volume-hall.jpg)

| | |
|---|---|
| ![Inside a passage, the path a dependency opened through matter](genesis-volume-passage.jpg) | ![Lumen Recipes' universe: a labyrinth of walls and openings around its hall](genesis-volume-lumen.jpg) |

*Frames from the proof's offline render (Code Resonance) and the render lab (Lumen Recipes at the same proof time),
AMD Radeon iGPU through WSL2 D3D12, 1920×1080.*

## The finding about the sheet

The G1.5 field is a sheet: a disc of matter, topologically fixed. It can fold, buckle and (with its rim held) enclose a
vault, but it cannot open a hole, a tunnel or a network of chambers. Each of those needs a cut in the surface, and
nothing in its physics cuts. Its regions are territories on one surface, so "layers", "openings" and "paths through
matter" could only ever be produced by a camera. The vault interior of G1.5 is the most the sheet can give: one cavity
under one surface. **The sheet topology prevents what this gate asks for.**

## The alternative: matter in a volume, hollowed by life

`public/worlds/genesis-volume.js` (`VOLUME_VERSION` 1) keeps everything else the G1.5 field established: the Lawbook,
the structure from the recording, the score's notes as forces, one clock, a fixed step, bounded memory, the engine's
own elementary functions and state hashes that agree across engines. What changes is where matter lives.

- **A volume of matter** on a 64×48×64 grid, periodic in every direction: no walls, no floor and no ceiling.
- **Life hollows it.** A Gray–Scott reaction–diffusion whose activity, where it is high, is open space. Where the
  activity crosses its threshold is the wall of matter.
- **Every subsystem holds a region** of space around its seat: a power diagram sized by its share of files, with the
  core given more. Each region's chemistry follows its own law, so each region builds its own architecture. The
  regimes were chosen by measuring them in three dimensions: a periodic 48³ sweep of 2,400 steps per regime, run
  while choosing them (a numpy script, not committed), for the open share, whether the open space is one network, and
  whether it keeps changing:

| Regime | Open | One network | Keeps changing | Given to |
|---|---|---|---|---|
| open | 100 % | yes | gently | the core: a great hall the other regions wall in |
| labyrinth | 61 % | yes | slowly | interface code, loose logic |
| tubes | 32 % | yes | slowly | cohesive logic |
| chambers | 30 % | no (separate) | grows and divides | tests, models |
| tide | 44 % | yes | never settles | the livelier variant when the stability law is low |
| worms | 34 % | 2 pieces | moves | services |

  Neighbouring regions' laws blend over a border several cells wide, so their architectures grade into each other.
- **A dependency is a passage.** Along the line between the two seats the chemistry is fed, so a tunnel opens over
  five seconds and stays open. A current runs through it from the region depended on, carrying a nutrient that the
  dependent region feeds on. A new dependency therefore opens a new path through matter.
- **Music is pressure.** A damped wave equation through the whole medium: each bass note strikes its region at its
  seat, and the wave crosses the world. The walls (the activity's threshold, shifted by the pressure) move with it,
  about 5 cells near the struck region and 0.4–1.2 cells twenty cells away, then settle. It is linear and damped, and
  leaves the matter unchanged (tested).
- **Light from the state.** The view (`genesis-volume-view.js`, a raymarcher reading the volume each frame) lights
  walls where the matter is changing: a running measure of the activity's change, its *life*. The passages' nutrient
  is a light carried along them that also lights the walls around it. There is a key, a fill, occlusion and depth fog.
  No particles, no bloom, no geometry of its own.

## The proof

`run.js … --field '{"volume":true}'`, Code Resonance's recording, its ninth recorded dependency between subsystems
(recorded at +185.7 s), and its score. One continuous 58 s take (proof seconds 30 to 88; the universe forms from seeds
in the 30 s before):

| Film | What happens |
|---|---|
| 0–14 s | **Locked wide view** in the core's hall: the regions' walls across it, the passages' light; at 6 s the recorded dependency appears and its passage begins to open |
| 14–34 s | **Traversal**: the camera crosses the hall, enters the new passage (the path the dependency opened), follows it, and turns back out into the hall at another vantage (the route stays at least 9 cells from matter: checked in the simulation) |
| 34–58 s | **Locked**: the hall and the passage's branch, as the score plays (from 18 s): its notes move the walls throughout |

The films are local: the review page's new section at the top of `qualification/results/films/genesis/index.html` in
the main checkout. **Offline, 60 fps** is the same engine rendering every frame, with the same states (hashes
below). **Real time** is the page's own recording at 1920×1080 while the simulation followed the audio clock (34.7 fps
recorded, 43 fps live).

## Evidence

AMD Ryzen 9 9950X3D, AMD Radeon iGPU through WSL2 (ANGLE, D3D12), headless Chromium.

| | Result |
|---|---|
| State hashes | Node, real time, real time recorded and offline: **identical at all 25 checkpoints** (4 s … 88 s; at 88 s `3c83d1e104169847`) |
| Simulation (CPU) | 6.243 ms a step in Node, 6.7 ms in the browser (p95 7.6); 196,608 cells, 8 regions, 8 → 9 passages |
| Real time, 1920×1080, the whole take | **43 fps**, frame p50 23.3 ms / p95 37.9 ms, 9.98 % over 34 ms; CPU 7.7 ms and **GPU 22.13 ms** per frame (p95 23.92) |
| While recording | 34.7 fps |
| The hall, by resolution (data, not used for the proof) | 1920×1080 43.6 fps, GPU 21.7 ms · 1280×720 59.5 fps, GPU 10.64 ms · 960×540 59.5 fps, GPU 6.55 ms |
| The AMD baseline | G1.5 exterior 13.8 ms GPU (58.9 fps), G1.5 vault interior 36.8 ms (26.8 fps). The volume at native 1080p is between them and stays above 30 fps; it does not reach the exterior's 60 fps |
| Machine load during the runs | 1-minute load average 1.5–2.9 (the script waited for it to fall below 3; other work on the machine had pushed it to 8) |

The first probe of the raymarcher measured 77 ms of GPU per frame: fixed small steps through open space and a camera
inside dense matter. Steps sized by the distance to the threshold brought it to 22 ms at the same resolution; nothing
was reduced to get there.

## Compared with G1.5

| | G1.5 field (sheet) | Volume |
|---|---|---|
| Topology | One fixed sheet; folds and encloses, never opens | Matter in space; cavities, openings, tunnels and networks form and change |
| Large spaces | A vault under one surface | A great hall walled by other regions' architectures; continuous in every direction |
| Paths through matter | None (camera only) | Passages opened by dependencies; the regions' own networks (labyrinth, tubes) |
| Regions | Territories on the surface (glaze, growth) | Volumes with their own chemistry and architecture (measured regimes) |
| A dependency | A supply line on the surface; a tendon folds it | A tunnel opens between two regions and carries its supply |
| Music | Vibration of the sheet (elastic, local) | A pressure wave through the whole world |
| Life when idle | Currents stir the field; the slow shape creeps | Living regimes (chambers, tides) and passages keep changing; static regimes rest |
| Distinct projects | Different shapes and glazes | Different architectures (Lumen: labyrinths around its hall; Code Resonance: tube networks and chambers, many passages) |
| CPU per step | 3.7–5.1 ms (5,941 vertices) | 6.7 ms (196,608 cells) |
| GPU per frame, 1080p | 13.8 ms exterior, 36.8 ms vault interior | 22.13 (43 fps) ms |
| Determinism | Node = real time = offline | Node = real time = recorded = offline |

## Limitations

- **The look is a first pass.** It reads as a dark, organic cavern with lit passages, not yet as an unfamiliar
  universe. The surfaces are smooth reaction–diffusion isosurfaces, so they are soft and bone-like rather than
  architectural. The lighting (a key, a fill, life glow and the passages' light) is the part with the most room left.
  Large parts of the hall's walls are static, so they are lit but not alive.
- **The take** passes through a dark stretch inside the passage (around film 26 s), and its last hold resembles its
  first. A better route needs a path planner over the simulated clearance, rather than hand-placed keyframes checked
  against it (the route was checked, never closer than 9 cells to matter).
- **Scale.** The world is periodic at 64 cells, about 6–8 architectural features across. Fog hides the repetition, but
  it also limits how far a wide view reaches. A larger world costs CPU linearly (6.7 ms a step now) and texture upload.
- **Cost.** 43 fps at 1080p meets 30 fps, not 60. The view uploads the whole volume every frame (3 MB). Uploading
  only what changes, and empty-space skipping, are the obvious next savings.
- **Determinism** holds across Node and Chromium. The volume uses Float32 storage, so a different JavaScript engine
  would agree only if its float32 rounding on store is IEEE, which the standard requires.
- **Music** moves walls (about 5 cells near the struck region, 0.4–1.2 cells far away) but does not change the
  chemistry. The resonance is in the medium, not in the architecture.
- **The proof regions** use 8–9 of Code Resonance's subsystems (up to 16 supported). Excalidraw (no recorded change)
  was not used.
- **Not run:** other GPUs, Windows, the player, a long soak. Not built: worker execution, seek checkpoints (it
  simulates from seeds: 30 s before the film), and integration. These are the same gates as the field's.

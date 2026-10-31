# Digital life

The three flagship worlds can be inhabited, and so can the preview Temporal Terrain: autonomous populations that sense,
move, gather, leave traces and react to the world and to each other. This document is the contract: what the system is, what is deterministic and how
exactly, what changes for existing identities, and what it costs.

## The loop

```
entities move (inertia, bounded steering)            sim.js
  → entities deposit influence (trail, energy, momentum)
  → fields change (diffusion, decay, saturation, drift with the current)
  → other entities sample the changed fields and their neighbours
  → their trajectories change; groups form, crowd, disperse
  → the visible environment responds (the world reads visits and fields)
  → …
```

Every arrow is in the code and tested directly (`tests/life-sim.test.js`): the same initial state with and without
an attractor, a repulsive region, neighbours, trail deposits and momentum deposits gives measurably different
trajectories. The worlds only present it.

## Layers

| Layer | Where | What |
|---|---|---|
| A. Entities | `public/worlds/life/sim.js` | Structure of arrays per slot: position, velocity, previous position, energy, age, lifetime, fade, species, mode, target site, generation (identity = slot + generation), wander heading, perceived neighbourhood, trail ring, grammar scratch. Forces are bounded (`maxForce`), mass is inertia, speed is bounded. |
| B. Fields | `sim.js` | 2D grids over the ground plane: trail, energy, disturbance and a momentum flow (x, z), plus density rebuilt each tick. Bilinear sampling, per-tick gradients, diffusion, decay, saturation, semi-Lagrangian drift of the trail with the current. |
| C. Feedback | `sim.js` | Entities deposit trail (more while gathering, seeking or carrying), energy (while gathering) and their momentum; crowds above a species' threshold deposit disturbance (congestion). |
| D. Grammar | `public/worlds/life/<world>.js` | Species (numbers), relations between species, the macro current, spawning, habitat (sites from the world's own layout) and optional hooks (steering, decisions, routes). |
| E. Influences | `public/worlds/life/driver.js` | Canonical intents become bounded site conditions and field deposits; the musical climate becomes slowly relaxing conditions. Neither ever places an entity. |

Neighbours are found on a uniform grid (counting sort, the 27 cells around), at most 24 per entity, each entity
perceiving its neighbourhood every other tick (10 Hz); never all pairs.

### Modes

`explore` (wander, follow trails, ride the current), `seek` (go to a chosen site), `orbit` (gather around it, feed),
`disperse` (leave a crowd or a disturbance), `rest` (low energy), `settle` (stay where the current is calm, dislodged
when it strengthens) and `route` (a world's own navigation). Transitions come from local conditions: crowding,
disturbance, energy, satiation, the current, the trail. A fed entity leaves carrying the site's influence: it lays a
stronger trail for a while, which is how a gathering's influence travels to another place.

### Lifecycles

Each species has a quota of slots (bounded by the capacity) and an active share (`life.density`). Entities fade in,
live a seeded lifetime, fade out, and their slot is reused by a new generation after a seeded delay. Nothing grows
with time: no per-event spawning, fixed arrays, fixed trail length, a bounded number of sites (64) whose conditions are
forgotten when the site disappears.

## The ecologies

| World | Inhabitants | What they do | What the world shows of them |
|---|---|---|---|
| Fractal Biosphere (`life/biosphere.js`) | pollinators, spores, plankton colonies, drifters (about 1000) | Pollinators choose an organism's crown heads by appeal (visitors, trail, the organism's prominence, lasting milestones; winner-take-more), crowd above a threshold that scales with the crown, drain its nectar and leave in small streams for the next crown. Plankton colonies gather and move on between crowns; spores ride the gyre and settle in calm water; drifters wake where the water is disturbed. A failure opens a void around the strained organism and scatters life; a recovery lets it return. | Visited crowns and buds light up locally (the organisms' own photophores); explorers are dim and tail-less, gatherings are the brightest. |
| Stellar Forge (`life/stellar.js`) | dust, accretion fragments, charged motes, stellar wind (about 1100) | Matter moves with the galaxy's differential rotation, density waves and eddies; systems capture fragments on eccentric bands; a failure's onset blows a system's halo out and its wind thickens, a recovery draws the matter back; a new system pulls harder for a while; verified milestones are lasting attractors. | Soft tapered ribbons and uneven beaded clumps; the gas map brightens along the streams matter keeps using (a matter map rebuilt from the state each tick). The galaxy stays the protagonist. |
| Machine Cathedral (`life/cathedral.js`) | couriers, wardens, sparks | Routed on the city's own network (kerbs, docks, shafts on each tower's stone, galleries, spokes, channels, canal corridors, cables), never through stone. Traffic on a route deters the next traveller (congestion) or draws it (trail); shaft gates release climbers in convoys, kerb junctions admit platoons on the precinct's beat. A failure withdraws the wardens from the struck precinct; after a recovery they gather at the hub's foot and climb together. | Lanterns with their own halo shader; copings, channels and cables lit by recent traffic. |
| Temporal Terrain, preview (`life/terrain.js`) | grazers, swifts, gleaners (720) | The land flows back with time (its rate is the macro current, and the trail, energy and disturbance fields ride the land back, so the herds' paths and a fault's disturbance recede into history). Grazers graze the pastures of the present (each file's ridge behind the front edge, by its height and how recently it changed) against that flow, travel in the valleys, follow the herd that left before them, are lured by a new or nourished range, lie down and are carried back when tired, and drift into the haze when old. A fault scatters them from the struck range to shelter in the others' valleys (the disturbance it keeps emitting recedes as a scar); a recovery brings them back. Swifts flock over the present and over lit ranges; gleaners follow the herds' receding paths through the older land and settle where time runs slow. | Soft warm lights on the drawn ground (grazing ones brighter), their light on the ground and on the contour lines around them, their paths as contour lines brightened where they cross them; fine cool swifts with short streaks; faint amber gleaners. |

## Ecology v2

`genome.life.ecology: 2` (recipe v4's default for new identities; absent means 1) reads the climate from the music
itself and lets it shape more than speed. Ecology 1 is the code path as it was, bit for bit (its pinned digests are
unchanged), so stored identities live exactly as before until they are deliberately upgraded (a `tune`).

**Climate from the music.** The driver keeps its own musical clock (`public/worlds/musical.js`) over the same canonical
frames, configured from `config.music` (the score version, style, profile and seed the player plays; the host passes
it in `lifeConfig`). At every tick the expression at that moment (the form's role, energy, harmonic tension, dynamics,
rhythm, transitions, onsets) becomes targets for the conditions (`driver.js` `climateOf`); the beat grid of the
performance clock goes with them. It never looks ahead and never listens to the audio device.

| Condition | What the music sets | What the ecology does with it |
|---|---|---|
| `current`, `turb`, `cohesion`, `activity`, `attract`, `swing` | energy and dynamics, harmonic tension, onsets, the role | as in ecology 1, felt per species |
| `gather` | regathering roles and energy up, dispersing roles and calm down | the crowd a site carries, the willingness to gather |
| `explore` | development, transitions, energy | curiosity, shorter visits, migration, a wider reach |
| `persist` | sustained passages (little rhythm), releases | how long trails and energy last |
| `shiftX`, `shiftZ` | a turning attractor: toward the music's home direction in statements and returns, a new direction each other section, leaning with the harmony | which sites appeal, by their direction from the habitat's centre |
| `glow` | energy, dynamics, a verified milestone's lift (with restraint) | presentation only: the environment's light |
| `pulse` | the rhythm the arrangement plays, carried by energy | the Machine Cathedral's convoys and pulses on the musical grid |

Roles: development explores, release settles, return regathers, an interlude disperses gently, tension unsettles,
resolve re-forms the groups, a statement is the ecology's own home. Each condition relaxes at its own pace (light and
activity in seconds, the attractor and the fields' memory over a passage), and every species feels them through its
own response weights (`respond`: an exponent per condition), so the same music is read differently by pollinators and
drifters, dust and motes, couriers and wardens.

**Music influence** (`life.music`) is a perceptual mapping, not one factor: each ask is taken in log space through a
soft limit per condition, scaled by `m(.75 + .25m)`. **0, independent ecology**: exactly neutral conditions (tested);
**1, musical ecology**: clearly visible, tasteful; **2, expressive ecology**: unmistakable, saturating at the limits,
never chaotic.

**Conditions, not choreography.** The music changes fields, incentives, carrying capacities and site appeal; nothing
places an inhabitant.

- *Fractal Biosphere*: the winner-take-more softens and follows the music's willingness to gather, an organism busy on
  all its heads saturates and a leaver prefers another organism, the crowd a crown carries follows `gather` and the
  attractor; attention travels beyond the dominant organism (in the test habitat at music 1, the busiest organism's
  share of the gatherings falls from about half to a third). Exploring music sends gatherings on; how many pollinators
  are awake follows what the crowns carry now, so where the habitat cannot feed them all, calm music keeps fewer awake.
- *Stellar Forge*: the music never turns the galaxy faster: the climate's current is taken out of the rotation and given
  to the density waves, the migrating wave and the regional eddies; gathering music concentrates matter around the
  major systems, the attractor favours one side of the disc and then another.
- *Machine Cathedral*: with rhythm the hubs release their waiting on the beat (one hub a beat, each once a bar, every
  other beat when it drives hard) and more of the staff waits for it; the beat runs out from each hub along the kerbs;
  hub weights follow the music's attraction and attractor, and couriers may change course toward the favoured hubs.

**Presentation** (§18, ecology 2 only, never writing the state): Biosphere lifts the light of the smaller gatherings so
looking around is rewarded; Stellar draws fine tracers where dust streams; the Cathedral's lanterns keep a depth-aware
floor with a softer core and the travelling ones cut through the fog a little more (no oversized neon dots).

**How the music shows** (`present.js` `musicLook`). Behaviour alone is too subtle at film scale (the inhabitants are
small, the camera moves), so the relaxed conditions also drive the drawing: factors that are exactly 1 at the neutral
conditions (music 0 draws exactly what it drew; ecology 1 never asks) and log-linear in them, so music 2 reads about
twice as strongly as 1. `glow` is light only (no behaviour reads it), so its soft limit is wide and it relaxes over
3.5 s: a passage's weather, never the beat.

| Factor | From | Biosphere | Stellar Forge | Machine Cathedral |
|---|---|---|---|---|
| `light` (modest) | glow | the water's light: haze, caustics, light through the organisms, rays; a quiet passage dims it, a full one brightens the shafts (the deep water keeps its blacks) | the arms' gas | the architecture's light, and widest the city's glow in the low haze and on the horizon |
| `life` (strong) | glow, gather | the light the life gives crowns, halos and floor (tension, which scatters the groups, dissolves it into sparks) | the gas along the streams | the routes' light on copings, channels, cables, wet floor |
| `bright`, `size` | glow, activity, gather | pollinators fully, plankton and spores less, drifters least | motes flare, rubble less, dust follows its stream | lanterns |
| `trail` | persist, activity, turbulence | orbit arcs, seekers' threads, spores' streaks, drifters' wakes | mote ribbons, rubble arcs, dust tracers | the comets' length and how long they stay bright |

Measured on the lumen performance (1280x720, same camera, AMD; `qualification/visual/film.js --copy --tune
'{"life.music":N}'`). The systematic part (each second's mean luma minus music 0's, standard deviation over the clip)
before and after, at music 1 / 2; the frame-to-frame change stays as it was (no flicker) and music 0 renders the same
frames:

| Clip | Sections | Before | After |
|---|---|---|---|
| Biosphere 60-150 s (Film 2) | statement, tension, resolve, interlude | 0.87 / 1.67 | 2.45 / 5.30 |
| Biosphere 100-145 s | tension, resolve, interlude | 0.91 / 1.80 | 2.54 / 5.57 |
| Stellar Forge 125-170 s | resolve, interlude, return | 0.13 / 0.15 | 4.67 / 9.73 |
| Machine Cathedral 150-195 s | interlude, return | 0.05 / 0.08 | 2.02 / 4.55 |

(Film 2's mean absolute frame difference against music 0 went from 3.53 / 3.91 to 4.26 / 6.01 of 255.) A statement
is the ecology's home and stays close to music 0; tension reads in the motion and the scattered light rather than in
the brightness.

**Determinism.** The music's configuration is part of the parameter key (a checkpoint never crosses a change of score,
style, profile or seed; a live session keeps its population through one), and a live rebase keeps the frames the musical
clock still reads. `tests/life-ecology.test.js` plays one performance to each world at music 0, 1 and 2 and checks
that migrations, attention, the systems' hold on matter and convoys differ clearly, that music 0 is neutral, that runs
are deterministic and that ecology 1 keeps its pins.

## Determinism

### Clock

Simulation time is the performance's **view time** (seconds since the performance's origin at the playback speed),
stepped at **20 Hz**. The state shown at view time `v` is the state after `floor(v × 20)` ticks; presentation
interpolates from the tick before. No wall clock, frame count, refresh rate or `Math.random` enters the state.

### Inputs

All inputs are canonical, kept in canonical order (time, kind, recorded order, id) with prefix fingerprints
(`life/timeline.js`):

- **Structure**: each recorded window's graph delta. The habitat is evaluated on a *shadow model* fed these windows
  in order, so the ecosystem's past knows the structure as it was (the world's own model, after a seek, knows only the
  present).
- **Frames**: each window's controls. The climate is a fold over the bars of the performance clock (`bar =
  floor(time / bar length)`, the grid the music anchors to): energy smoothed per bar as the music smooths it, and the
  score's own section rule (`ResonanceScore.chooseSection`) on the recorded tension, with milestones from the
  intents. Nothing is read from the audio device; sound off changes nothing.
- **Intents**: the canonical intents by id. An intent names modules; it is mapped to its site on the shadow model
  at the ecosystem's own position (the structure consumed so far), so a seek back maps it exactly as continuous play
  did.

A grammar's habitat can carry **data** derived from the same structure (the Machine Cathedral's navigation network):
the driver hands it to the ecosystem with the sites and again after every restore, so a restored state never depends
on what a grammar happens to have cached. Site indices a grammar keeps per inhabitant (`siteSlots`) follow their sites
when the habitat changes, as the ecosystem's own targets do.

### Contract

For the same **simulation version, grammar version, recipe life values, project seed, playback speed, tempo and
performance origin**, the ecosystem's state at a view time is a pure function of the inputs before it (in a replay or
a film: of the inputs since its generation's warm start and the lasting history before it, see
[Generations](#generations)): **bit-identical** (the `digest` of every array) after continuous play at any frame rate,
seeks back and forth, a restored checkpoint, a fresh session or a browser restart, **within the same JavaScript
engine** (the state is double-precision arithmetic stored in typed arrays; `Math.sin`, `Math.exp`… are the engine's).
Qualified in Node and Chromium (`tests/life-driver*.test.js`, `qualification/visual/life.qual.js`).

Rendering quality never changes the state: quality decides how many followers are drawn, not what the ecosystem is.
Images are byte-identical on the same GPU and driver (as the worlds already are); across GPU vendors only the state is
claimed identical, not the pixels.

### Checkpoints and invalidation

A recent ring (every 2 s, six kept) and an even spread over the performance (every 20 s, at most 24 kept) carry the
ecosystem, the climate, the input position and the **generation**. A checkpoint is used only for a moment of its own
generation, and only when:

- its configuration key (grammar, simulation version, seed, speed, tempo, origin, live base structure) and its
  parameter key (the recipe's life values) match, and
- the fingerprint of the inputs before it is unchanged and no input was added at or before its time.

Otherwise it is dropped and the state is rebuilt from an earlier valid one or from its generation's start.

### Generations

A replay or a film lives in **generations** of 10 minutes of view time (`GENERATION`, 600 s = 12 000 ticks). The
ecosystem shown at view time `v` is the one of generation `g = floor(v / 600)`; its **anchor** is `g × 600 s`.

- **Generation 0** starts at the performance's origin exactly as before generations: same seed, same inputs, same
  code path. Its states are bit-identical to the driver before generations (digests recorded with that driver and
  pinned in `tests/life-driver-generations.test.js`, replay and live; the three flagship grammars on the recorded *lumen*
  performance checked the same way).
- **Generation g ≥ 1** starts at its **warm start**, `WARM` = 60 s before its anchor (tick `g × 12 000 − 1 200`), with a
  fresh population (seed `mix(seed, g)`) and a **history pass**: every input at or before the warm start's time is
  consumed as history. The habitat is the one after the last recorded window at or before that time (on the
  structure as it was then); verified milestones and verified refactors before it set their lasting conditions,
  mapped on that structure (as a live session joined late carries them); the climate fold restarts 64 bars before it,
  each bar taking the last frame at or before the bar's start. Nothing transient carries over: no disturbance,
  nourishment, trail, flow or position. From its warm start the generation consumes the inputs like any ecosystem and
  has lived a minute on them when it is first shown at its anchor.

**The contract.** The state at a view time is a pure function of the inputs since its generation's warm start plus
the lasting history before it (and of the configuration listed above, and of the constants `GENERATION` and `WARM`):
bit-identical after continuous play across any number of anchors, seeks in either direction, checkpoints, a fresh
session, and whether or not the next generation was prepared in the background (all tested in Node).

**Across an anchor.** From 90 s before an anchor the next generation is prepared in the background: a runner of its
own (population, input position, climate and its own shadow model; the habitat cache is shared, a pure function of the
structure), brought to its warm start a few windows at a time, given its history pass in a frame of its own, then
stepped toward the anchor within about 2 ms a frame (a tick only when the cost of the last ones says it fits; the first
of a frame always, so a machine whose tick exceeds the budget still progresses). The exception is once per page: the
first ticks of the first second ecosystem cost several times more (the JavaScript engine reoptimises the simulation
for two ecosystems; later anchors do not pay it), so about 90 s before a page's first anchor one or two frames take
8–11 ms. Films are paced without a limit, so a film frame never waits for it. At the anchor it is handed over; if it is late,
the ordinary catch-up continues it and "restoring" is reported only when it is more than 3 s behind. The view
**crossfades**: the population fades out over the 2 s (`CROSS`) before the anchor and the next generation fades in over
the 2 s after it. The fade is the view's `fadeIn`, a pure function of view time that never touches the state; the
worlds scale everything they draw from the ecosystem by it, inhabitants and field-driven light alike (the Biosphere's
crown and floor light, the Forge's gas and matter maps and captured light, the Cathedral's lit copings, channels and
cables).

**The seek bound.** A far seek from a fresh session simulates at most one generation and its warm start, 13 200 ticks,
plus the history pass, however long the performance (before generations, a seek to the end of the 13-day *lumen-long*
replay meant about 19.5 million ticks). Measured in Node on *lumen-long* as the receiver serves it (12 796 windows,
75 138 inputs, 1 148 150 s of view time), replay configuration:

| | Fractal Biosphere | Stellar Forge | Machine Cathedral |
|---|---|---|---|
| Far seek to the end (generation 1913, 8 200 ticks), one update without a budget | 6.6 s | 10.8 s | 9.4 s |
| Worst far seek (the last tick of a generation: 13 199 ticks) | 9.6 s | 14.6 s | 13.3 s |
| Simulated tick | 0.73–0.81 ms | 1.11–1.31 ms | 1.01–1.14 ms |
| History pass, fresh session (the shadow replays all 12 796 windows) | 75–81 ms | 43–65 ms | 60–77 ms |
| History pass, later seeks (the shadow forward or rebuilt) | 6–42 ms | 6–45 ms | 11–42 ms |
| The qualification's seeks (85 %, 15 %, 60 %) at the player's budget, frames back to back | 9.8 / 2.0 / 3.6 s | 11.2 / 2.2 / 4.1 s | 9.5 / 1.9 / 3.4 s |
| Background preparation per frame (60 fps, the 100 s before the anchor): p95 / p99 | 1.9 / 2.0 ms | 1.9 / 2.1 ms | 1.9 / 2.0 ms |
| Its history-pass frame: a page's first anchor / a later one | 3.6 / 0.9 ms | 5.6 / 1.2 ms | 6.0 / 2.1 ms |
| Its worst frame at a page's first anchor (its first ticks, once per page) | 8.1 ms | 11.2 ms | 10.7 ms |

Node 22.22, Ryzen 9 9950X3D, measured while films rendered on the same machine (load average 4–12; the background
rows in a fresh process at the last anchor, 1 147 800 s, then at a second anchor in the same process). Across the
anchor the next generation was handed over on time (not restoring) and its state matched a fresh far seek to the
same moment in all three worlds. In a browser the restores take longer (each frame also renders); the qualification
allows 180 s a seek.

**Live sessions have no generations**: one population from the join (its memory bounded by folding, below), no
crossfade. A live session's past is not replayed, so it needs none.

### Seeking

A seek restores the latest valid state of the target's generation at or before the target (the shown ecosystem, the
next generation prepared in the background, a checkpoint of that generation, or the generation's start) and simulates
forward; a seek forward within a generation restores a later checkpoint when one lies between rather than simulate the
way there. Catching up is bounded per frame (a few milliseconds, at least 20 ms while restoring, when the inhabitants
are hidden anyway; films excepted: a film frame waits for the exact state). While the target is more than three
seconds ahead the view reports **restoring** with its progress: the inhabitants are hidden and the stage says
"Restoring the ecosystem for this moment · n %" rather than showing a stale population as if it were the moment's.
Measured costs are in [QUALIFICATION.md](QUALIFICATION.md#digital-life-phase-10) and, for far seeks, under
[Generations](#generations).

### Live sessions

A live session's origin is when it was joined. Its habitat starts from the structure as joined; intents from before
the origin carry over only their lasting conditions (verified milestones), never transient ones. A change of life
values or of tempo (a music style) in a live session applies from now: the population continues, the bars continue
from the current one. A replay or a film derives its state from the values, so a change there rebuilds it exactly.
Switching from a replay to live starts a new performance (a new origin, an empty timeline): the replay's inputs are
not the live session's.

A live session's memory is bounded. Past 1200 consumed inputs the driver **folds** them: the timeline keeps only what
is not consumed yet (plus verified lasting intents, as history), refuses inputs at or before that moment, and the
structure as it is becomes the session's base. The running ecosystem continues exactly (it keeps its population, its
own shadow model and its habitat; tested bit-identical against a session that never folds). A world switched to
during a live session starts its ecosystem at the last fold, from that base, rather than replaying the session from
its join. The base is the structure without its history (births before it, module order renumbered), so a new
world's habitat can differ slightly from what an unfolded history would give. Live sessions are not replays: none of
this applies to replays or films, which keep their whole recorded timeline and are exact.

## Engineering events

The driver maps canonical intents (never raw events, never source) to site influences. Strength follows the intent's
tier, magnitude and evidence (`inferred` counts half); only `verified` evidence leaves a lasting change.

| Intent | Influence |
|---|---|
| subsystem.created | novelty: explorers come to see |
| module.created, structure.created | nourishment |
| structure.modified (human edits), agent tool use | a small perturbation at the module's site |
| structure.removed | a small disturbance |
| subsystem.connected | a trail laid between the two sites |
| validation.failed | strain: a disturbance that keeps emitting until it fades or recovers; gatherings disperse |
| validation.recovered | strain cleared, energy returns |
| validation.passed | nourishment |
| refactor.validated | the current reorganises around the site (a vortex); lasting if verified |
| milestone.achieved | a lasting attractor if verified; nourishment otherwise |

**Ambient life is not agents.** The inhabitants are simulated. They are never labelled, never counted as agents and
never placed from agent presences; observed agents keep their own presences and lifecycles. A new inhabitant is never
a new coding agent, a courier is never a tool call.

## Recipes and versioning

- Generator v3 (`engine/recipe.js`) adds `genome.life` to **new built-in identities** (from its own random stream: every
  v2 value is unchanged, pinned in `tests/recipe.test.js`). Pack worlds and looks never get it.
- Generator v5 adds it to new identities of **Synaptic Storm, Fractal Continuum and Temporal Terrain**, the worlds it
  graduated, in the same way (`rng('life', <family>, seed, variant)`: enabled, the per-project character of `density`,
  `vitality`, `collective` and `trails`, ecology 2), so every v4 value of those worlds is unchanged
  (`tests/generator-v5.test.js`). An identity of one of them saved before v5 has no `life` and keeps it so. The
  values draw nothing until the world has an ecosystem grammar (`ctx.life.create`), and the life controls appear in
  the Visual Studio when its catalogue lists the `life.*` group.
- **Stored identities keep exactly what they had**: a recipe without `life` renders as before. The Visual Studio's
  *Digital life* group turns it on (a tuning of `life.enabled`: preview, cancel, apply; reset removes it again).
- `life.enabled: false` (or absent) renders the world exactly as before: no ecosystem, no draw call, no uniform
  changed. Checked byte-identical against the PR #9 renderer.
- Approved films keep their recipes (`<film>.recipe.json`): those have no `life`, so they render as they did.

### Controls (`engine/catalog.js`, `life.*`)

Every value is a scale (1 = the world's own artist-directed behaviour; 0–2 unless noted), so no setting can make the
simulation unstable: `enabled`, `density` (0–1: the share of the world's inhabitants that live; the world's own
population is its ceiling), `vitality`, `collective`, `environment`, `trails`, `persistence`, `music`, and the advanced
`attraction`, `repulsion`, `separation`, `alignment`, `cohesion`, `current`, `diffusion`, `radius`. `ecology` (1 or 2)
is a version, not a scale: see [Ecology v2](#ecology-v2).

## Visual packs

The generator never adds digital life to an identity drawn with a pack's world or look (generator v3 adds it to new
built-in identities only, v5 to the graduated worlds' as well, never under a look), and SDK 1.2 does not change that;
packs keep their sandbox and approval.

## Privacy

The ecosystem reads the shadow model (salted ids, graph coordinates) and canonical intents only. Inhabitants carry no
names or labels; entity identities are slot and generation numbers.

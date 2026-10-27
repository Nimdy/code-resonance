# Digital life

The three flagship worlds can be inhabited: autonomous populations that sense, move, gather, leave traces and react
to the world and to each other. This document is the contract: what the system is, what is deterministic and how
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

## The three ecologies

| World | Inhabitants | What they do | What the world shows of them |
|---|---|---|---|
| Fractal Biosphere (`life/biosphere.js`) | pollinators, spores, plankton colonies, drifters (about 1000) | Pollinators choose an organism's crown heads by appeal (visitors, trail, the organism's prominence, lasting milestones; winner-take-more), crowd above a threshold that scales with the crown, drain its nectar and leave in small streams for the next crown. Plankton colonies gather and move on between crowns; spores ride the gyre and settle in calm water; drifters wake where the water is disturbed. A failure opens a void around the strained organism and scatters life; a recovery lets it return. | Visited crowns and buds light up locally (the organisms' own photophores); explorers are dim and tail-less, gatherings are the brightest. |
| Stellar Forge (`life/stellar.js`) | dust, accretion fragments, charged motes, stellar wind (about 1100) | Matter moves with the galaxy's differential rotation, density waves and eddies; systems capture fragments on eccentric bands; a failure's onset blows a system's halo out and its wind thickens, a recovery draws the matter back; a new system pulls harder for a while; verified milestones are lasting attractors. | Soft tapered ribbons and uneven beaded clumps; the gas map brightens along the streams matter keeps using (a matter map rebuilt from the state each tick). The galaxy stays the protagonist. |
| Machine Cathedral (`life/cathedral.js`) | couriers, wardens, sparks | Routed on the city's own network (kerbs, docks, shafts on each tower's stone, galleries, spokes, channels, canal corridors, cables), never through stone. Traffic on a route deters the next traveller (congestion) or draws it (trail); shaft gates release climbers in convoys, kerb junctions admit platoons on the precinct's beat. A failure withdraws the wardens from the struck precinct; after a recovery they gather at the hub's foot and climb together. | Lanterns with their own halo shader; copings, channels and cables lit by recent traffic. |

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
performance origin**, the ecosystem's state at a view time is a pure function of the inputs before it: **bit-identical**
(the `digest` of every array) after continuous play at any frame rate, seeks back and forth, a restored checkpoint, a
fresh session or a browser restart, **within the same JavaScript engine** (the state is double-precision arithmetic
stored in typed arrays; `Math.sin`, `Math.exp`… are the engine's). Qualified in Node and Chromium
(`tests/life-driver.test.js`, `qualification/visual/life.qual.js`).

Rendering quality never changes the state: quality decides how many followers are drawn, not what the ecosystem is.
Images are byte-identical on the same GPU and driver (as the worlds already are); across GPU vendors only the state is
claimed identical, not the pixels.

### Checkpoints and invalidation

A recent ring (every 2 s, six kept) and an even spread over the performance (every 20 s, at most 24 kept) carry the
ecosystem, the climate and the input position. A checkpoint is used only when:

- its configuration key (grammar, simulation version, seed, speed, tempo, origin, live base structure) and its
  parameter key (the recipe's life values) match, and
- the fingerprint of the inputs before it is unchanged and no input was added at or before its time.

Otherwise it is dropped and the state is rebuilt from an earlier valid one or from the initial population.

### Seeking

A seek restores the latest valid state before the target and simulates forward. Catching up is bounded per frame
(a few milliseconds; films excepted: a film frame waits for the exact state). While the target is more than three
seconds ahead the view reports **restoring** with its progress: the inhabitants are hidden and the stage says
"Restoring the ecosystem for this moment · n %" rather than showing a stale population as if it were the moment's.
Measured costs are in [QUALIFICATION.md](QUALIFICATION.md#digital-life).

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
- **Stored identities keep exactly what they had**: a recipe without `life` renders as before. The Visual Studio's
  *Digital life* group turns it on (a tuning of `life.enabled`: preview, cancel, apply; reset removes it again).
- `life.enabled: false` (or absent) renders the world exactly as before: no ecosystem, no draw call, no uniform
  changed. Checked byte-identical against the PR #9 renderer.
- Approved films keep their recipes (`<film>.recipe.json`): those have no `life`, so they render as they did.

### Controls (`engine/catalog.js`, `life.*`)

Every value is a scale (1 = the world's own artist-directed behaviour; 0–2 unless noted), so no setting can make the
simulation unstable: `enabled`, `density` (0–1: the share of the world's inhabitants that live; the world's own
population is its ceiling), `vitality`, `collective`, `environment`, `trails`, `persistence`, `music`, and the advanced
`attraction`, `repulsion`, `separation`, `alignment`, `cohesion`, `current`, `diffusion`, `radius`.

## Visual packs

The Pack SDK is unchanged (1.1). Packs do not get digital life in this milestone and keep their sandbox and approval.

## Privacy

The ecosystem reads the shadow model (salted ids, graph coordinates) and canonical intents only. Inhabitants carry no
names or labels; entity identities are slot and generation numbers.

# Temporal Terrain (preview)

A contour landscape in which **time is the land**. The project's history is a terrain that unrolls toward the viewer:
the present is the front edge, a lit cut through the land where new ground is laid down, and the past recedes into the
distance toward the horizon. Elevation is accumulated structure; luminous, anti-aliased contour lines (topographic
isolines) drawn over a dark, softly lit relief are its signature. Subsystems are ranges, each in its own hue, files the
ridges that run back through time from the moment they were created, symbols the height and ruggedness of those
ridges. A replay lays the land down: every file that arrives raises a ridge at the front edge that then travels back
with the rest of history; where a ridge grew, its contour lines turn and crowd.

**Status.** A preview, the sixth built-in world family (`public/worlds/terrain.js`, `terrain-layout.js`,
`terrain-glsl.js`): chosen only explicitly (the Visual Studio, marked *In design*; the render lab's `--family
temporal-terrain`; the web demo), never by the family scores. Adding it changed no existing identity (see
[Selection and compatibility](#selection-and-compatibility)). It has **not been reviewed artistically** and has not been
watched in motion by a person (stills only, see [What is not done](#what-is-not-done)). Everything described here is
implemented unless marked *planned*.

![Self, halfway through its session](temporal-terrain-hero.jpg)

*Self (92 files in 10 subsystems, a 20-minute recorded session) at 50 %: rose, magenta and amber ranges on its
analogous harmony, the present's skyline lit in the identity's cool lamp colour at the front edge, the roads of its
cross-subsystem dependencies arching over it, and the survey stakes and dotted survey lines of its commits laid back
through its history. Every still on this page: GPU (AMD Radeon iGPU through WSL2 D3D12, ANGLE's EGL backend),
rendered at 1920×1080 at quality 0 on the film path, shown at 960×540.*

| | |
|---|---|
| ![The opening](temporal-terrain-opening.jpg) | ![Growth](temporal-terrain-growth.jpg) |
| Lumen Recipes, 4 % in: the files of the first recorded window stood before time, so they are an ancient ridge reaching to the horizon; the rest is open plain (nothing existed yet) | Lumen at 30 %: ranges rise out of the plain at the moment their subsystem was born (the slopes far back), Claude's light over the range it works on |
| ![An agent's edit](temporal-terrain-agent.jpg) | ![A failing run](temporal-terrain-failure.jpg) |
| An edit (Lumen at 60 %): the medium close-up of an agent's touch, the ground lifted under Claude's light at the front edge, its pool in Claude's colour | A failing run, 6 s on: the fault laid down along the covered ridges at the front, the cut flushed in the warning colour; the scars of earlier stress stay behind as red bands |
| ![The earned sunrise](temporal-terrain-sunrise.jpg) | ![A commit](temporal-terrain-commit.jpg) |
| The first verified milestone (a recovery), 2 s on: the earned sunrise (the horizon warms, a wave of warm light runs over the ranges) while healing light runs along the scars; a beacon stays | A commit that names no files, 2 s on: its survey line flashes pale across every range just behind the front edge (a commit with files also plants a stake on each committed ridge) |
| ![Idle](temporal-terrain-idle.jpg) | ![Excalidraw](temporal-terrain-excalidraw.jpg) |
| Lumen 90 s after the last event: the land still (the last state extends, its contours run straight), the two beacons, the healed scars; only light, mist and the beat move | Excalidraw (450 files, 9 subsystems, all from one baseline window): no history to show, one massif under hundreds of contours, the present's skyline in gold |

![The valley vantage](temporal-terrain-valley.jpg)

*Lumen tuned to the valley vantage (`--tune '{"camera.personality":"valley","motion.drift":0}' --idle 30`): low along
the land toward the horizon, which the milestones' dawn unlock has warmed.*

*All stills: `qualification/visual/lab.js --dataset lumen --family temporal-terrain --gpu amd --at 0.04,0.3,0.7,1
--touch --events --after 2,6 --idle 30,90` (and `--at 0.6` for the edit, `--dataset self
--at 0.15,0.5,1`, `--dataset excalidraw --idle 30`). In this sandboxed shell the AMD GPU is reached through ANGLE's EGL
backend with `DISPLAY` and `WAYLAND_DISPLAY` unset (the renderer string reads D3D12 AMD Radeon).*

## Reading the land

- **Toward the horizon is the past.** Depth is the age of the moment drawn there, on a logarithmic scale: the last
  minute near the front is wide, an hour ago lies near the horizon in the haze. Where nothing changed, the contours run
  straight back like the grain of wood; where something changed, they turn.
- **The front edge is now.** A cut through the land shows its strata (the same contour levels as faint horizontal
  lines) and its crest glows: the present's skyline. Settlement lights stand on each file's peak at the edge.
- **Height is structure.** A file's ridge rises with its live symbols; a subsystem's range rests on a plateau that rises
  with all of them (softly capped, so a 240-file subsystem does not tower). Big, intricate code is high, rugged country;
  a new file is a foothill.
- **Steep growth crowds the contours.** Contour lines are isolines of the elevation: where a ridge grew quickly, its
  lines bunch together across it; a removal erodes the ridge back to the plain (the valley it leaves stays in history).

## Mapping: what drives what

Every structure is project data from the world model (`public/worlds/model.js`; in a replay the whole recorded
history, see [Determinism](#determinism)) or the recipe; ambient life is labelled as such.

| Data | Image | Notes |
|---|---|---|
| Performance time *t* | **Depth**: the age *a* = *t*<sub>now</sub> − *t* of a moment sits at depth *L* · ln(1 + *a*/τ) behind the front edge (τ `time.scale`, 34–52 s; *L* `time.depth`, 54–66 units) | The land flows back as time passes (about 1.3 units a second at the front, ever slower behind); the same performance time gives the same land at any replay speed |
| Subsystem: `model.districts`, in order of birth | A **range** across the land in its own hue on the identity's harmony; the first in the middle, the next ones alternately right and left | A range never changes place in the order; it widens as its files arrive and pushes the ranges outside it outward (in history the ranges fan out from a narrow beginning) |
| A range's live files and symbols | Its **plateau** (`relief.massif`): a broad base rising with log₂ of its symbols and files, softly capped | |
| File: `model.modules`, in order of birth inside its range | A **ridge** at its own slot (alternately right and left of its range's first file, at `relief.spacing`, from the project's size at generation), running back through time from its birth | It never moves inside its range; its height from log₂ of its live symbols (`relief.height`) |
| Symbols: `model.symbols` (born, removed) | The ridge's height, and its **ruggedness**: the amplitude of the relief's small ridges (`relief.detail`) | A file with one function is a smooth hill; intricate code is rugged |
| File removed | The ridge **erodes** to the plain | The valley stays in the history |
| File state over time (`stateAt`): stressed | A **fault**: warning-coloured contours and a glowing fissure along the ridge for exactly as long as it was stressed, hot at the front, cooling to an ember scar with age | The scar stays in history between the failure and its recovery |
| File state: validated | A calm sheen in the valid colour on the ridge's index contours | |
| Commits: the recorded `repository.commit.observed` cues (live: the files the model saw committed, and the director's recent checkpoints) | A **survey line** across the land at the commit's moment, and a **stake** of light on each committed ridge | They recede with the land: the cadence of commits reads as a line of markers through history |
| Dependency: `model.links` across subsystems (`a` imports `b`) | A **road of light** arching from the importing file's peak to the imported one's just behind the front edge | Pulses run along it from the importer when its file fires; at most 32, newest first; dimmer the more there are |
| Agent presences (`frame.agents`) and their tool events (`public/worlds/touch.js`) | A **surveyor**: a light in the agent's CAST colour and shape hovering over the ridge it works on, its beam and a pool of its colour on the ground; its edit **raises the ground** there | See [Agents](#agents) |
| Director commands (`effect`) | The vocabulary below | Never time alone |
| `director.lasting()` | **Monuments**: a beacon on the subject's ridge at the milestone's moment (a cairn for a validated refactor), with a pool of warm light | Lasting; they recede with the land; rebuilt after a seek |
| `director.unlockedAt` | Dawn (the horizon and the key light warm), lanterns (small lights along the ridges in history), stars, aurora | Verified milestones only, in that order |
| `director.activityAt`, the score (`frame.music`) | The beat shimmer's strength; whether the idle drift runs | |

## Visual grammar

- **Relief**: a dark rock in the identity's secondary colour, lit by a low key light from the side of the land toward
  the horizon (the moon; warmer at dawn), with a sky fill from above that valleys lose. It is only a ground for the
  lines: never bright.
- **Contour lines**: isolines every `contour.interval` units, every `contour.index`-th brighter and wider (index
  lines), anti-aliased by their screen-space width (`fwidth`), each kind fading where its lines would crowd under a few
  pixels (far away), in the range's hue. The open plain below the first level has none (the land where nothing exists
  is dark). Land younger than a few seconds glows in the lamps' colour and cools as it travels back.
- **Palette** (its own stream, `terrainPalette` in `engine/recipe.js`): a night sky (`deep`, `haze`), the rock's tint
  (`secondary`), the contours' first hue (`primary`: teal, cyan, azure, violet, rose, amber or jade), the lamps of the
  present (`accent`: warm on cool lines, cool on warm ones), the pale survey lines and stakes (`highlight`),
  `warning` for faults (at least 40° from the lamps, never gold), `valid` for tests.
- **Harmony**: range *k* takes the hue at share `[0, 1, −1, ½, −½, ¾, −¾, ¼, −¼, 0.9, −0.9]` of the scheme's span around
  `primary` (28° analogous, 48° complementary, 64° split, 80° triad), ±4° from its id; a hue never falls in the olive
  band (48–100°).
- **The relief's texture** (ambient, never structure): a gentle meander of the ridges, a faint undulation, and
  ruggedness where symbols are dense, all fixed on the ground (*x*, depth): the structure travels back through it, and
  while nothing changes the land is still.
- **Sky** (atmosphere, never code): a gradient from the zenith to a moonlit horizon haze into which the far land
  dissolves, the key light's glow and disc, mist pooled in the valleys and thickening with distance, a few motes.
- **Grade**: AgX, bloom only from a high threshold (the lines and lights bloom, the rock does not), a little contrast; a
  fault desaturates and cools; a sunrise lifts exposure. The recipe's finish (Cinematic by default) applies on top.

## Layout

Pure functions of the recipe, the model and the time (`terrain-layout.js`, no THREE; pinned in `tests/terrain.test.js`):

1. **Time to depth**: `depthOf(age)` = *L* · ln(1 + age/τ), `ageOf(depth)` its inverse.
2. **Rows**: the land is sampled in rows of fixed moments, a pyramid of levels (`latticeAt`, `rowSlot`): the present,
   then 24 rows every 0.5 s, 24 every 1 s, 24 every 2 s … (11 levels, 265 rows, about 6.8 hours). A row's moment lies on
   its level's lattice of performance time, so its content depends only on that moment and the model: it is computed
   once and kept while it stays in its level (`createLand`; rows with no event inside their span share one content);
   the present row again only while an event lies inside its span. Each event rises over the row's span (six rows' time,
   at least 5.2 s: about the same slope in depth at every age), so a birth is a slope and never pops from row to row.
3. **Across**: per row, each range's width from its files born by then (`spacing` × (files + 1.4), at least 7 units),
   the ranges placed from the middle outward in order of birth, each file at its slot in its range (`rangesAt`). The lane
   grid (192 lanes) is centred on the land and grows in steps of a quarter (every row is laid out again when it does).
4. **Elevation**: per row and lane, the ranges' plateaus (Gaussian) plus the files' ridges (Gaussian), the ruggedness,
   the fault and validated shares (the part of the row's span the file spent in that state), the range colour and a
   crest mask (`rowAt`).
5. **Drawing** (`terrain-glsl.js`): a static grid whose rows are spaced for an even density on screen from the front
   edge to the horizon; each vertex finds its row by time (`rowOf`, the twin of `ordinalOf`) and samples the rows with
   cubic B-splines across and along, then adds the relief's texture (`reliefAt` is its JS twin, so lights, stakes and
   beacons stand on the drawn surface). Smooth effects are computed per vertex; the fragments draw the lines.

## Agents

- **Each provider its own colour and shape** (CAST seat, `public/providers.js`): Claude rose four-point spark, Cursor
  cyan ring, Codex lime diamond, Grok white six-point star, Qwen azure triangle, Kimi magenta double ring, unknown
  providers amber or grey dots. Subagents are smaller. Chips show catalog names only.
- **Where it is**: hovering just behind the front edge over the ridge of the file it works on while a tool runs on a
  file, or for 4.5 s after one of its edits lands; otherwise circling over its home range (higher while waiting), or
  over the land. Its trail is where it was, carried back with the land since.
- **Its touch** (the agent's own tool event, `touch.js`, or an attributed edit landing): the ground rises under it in a
  dome for about three seconds (the contour lines open into rings around it), rings of its colour spread from it, its
  beam and pool brighten. An edit's touch brings the camera to a medium close-up unless a failure, a recovery or a
  milestone-tier event holds it. Reading is quieter (0.45 of an edit).

## Events, failure, recovery and the earned sunrise

| Intent (effect) | Image |
|---|---|
| `subsystem.created` (range), `module.created` (peak), `structure.created` (uplift), `structure.removed` (erode) | From the model's own times: a new range rises at the side, a new ridge at the front edge, a ridge grows or erodes; the effect adds a glow through the contours there |
| `subsystem.connected` (road) | The road draws itself from the importer to the imported peak over 2.4 s |
| `validation.passed` (scan) | A **scan**: a front of valid light sweeps across the land near the present, brighter over the covered ridges; the validated sheen stays |
| `validation.failed` (fault) | A **fault**: the ground shudders along the covered ridges, the fissure flashes and sparks fly in the warning colour, the contours there turn warning-coloured and stay so while the files are stressed. Never gold, never a sweep |
| `validation.recovered` (heal) | **Healing**: light in the valid colour runs along the scar from where it began to the present; the scar cools |
| `repository.checkpoint` (survey) | The commit's survey line flashes across the land and its stakes light |
| `milestone.achieved` (sunrise), `refactor.validated` (terrace) | The **earned sunrise** or a local glow (below); a beacon (a cairn for a refactor) stays |
| `world.expanded` (horizon) | A brief lift of exposure |

**The sunrise rule.** As in the other previews: a sunrise needs the director's milestone tier (3 or more, one of its
three spectacle tokens) and, in the director's lasting record, the milestone is the first or comes at least **4 minutes
of performance time** after the last one that could earn it. Then the key light swings low behind the land, the sky
warms from the horizon, a wave of warm light runs over every range from the subject and the camera pulls back a little.
Otherwise the milestone is a **local glow** over the subject. Known approximation (as in Synaptic Storm and Fractal
Continuum): the gap rule reads every milestone time in the lasting record, so a downgraded milestone still holds the gap
(pinned in the test). Every verified milestone leaves a beacon, whether or not it earned the sunrise.

## Idle behaviour

With no input the land stays alive, never like a screensaver: the land still flows back with time, but the last state
extends so its contours simply run straight; the key light travels a slow arc (`motion.light`); mist drifts in the
valleys; the contours shimmer on the score's beat grid (on each beat one contour level in four brightens, climbing the
land beat by beat); motes drift; and the camera drifts between its vantage points (oblique, low along the land, high
above) every 170 s (`motion.drift`). Nothing grows.

## Labels and privacy

Words come only from generic phrases, roles, counts, CAST catalog names and `ctx.name(id)` (the user's alias or the
generated name): "A new range rises", "Tests fail · a fault opens under 8 peaks", "Recovered · the fault heals",
"Committed · 1 stake on the survey line"; range labels stand at each range's crest on the front edge with its role and
files; inspecting a peak says "A peak of Vauos · committed" with its symbols and roads. No file name, path or identifier
is drawn (tested on every intent's words, the range labels and the inspected peak).

## Determinism

No `Math.random`, `Date.now` or `performance.now`: every value is a function of the model, the recipe, the director's
fold and the frame's time. A replay's land is the whole recorded history up to *t*, whether the moment is played through
or sought: when the player primes the world after a seek, the host gives a built-in world that asks for them the
recorded windows (`onHistory`, also when the world loads into a replay already under way), and the world rebuilds its
own model of the history from them as the player builds it when it plays from the start, with the score's step grid at
a fixed tempo (so the land does not depend on the replay speed either). A live session's land begins when the player
joined it (what existed then is an ancient range reaching to the horizon). Rows are pure functions of their moments; the
cache only avoids recomputing them (tested: the same texture whether a moment is reached directly or after others).
Transient effects are cleared after a seek; commits come back from the model, monuments from the director's record.
`qualification/visual/identity.qual.js --family temporal-terrain --gpu amd` on Lumen, Self and Excalidraw: **15/15**
(the same frame bit for bit after a receiver restart and after a rebuild from the journal alone, and the three projects
structurally different).

## Performance

GPU time per frame (the host's timer: background, scene, post, bloom, grade), AMD Radeon iGPU through WSL2 D3D12,
1920×1080. The real player replaying at 8× at a fixed quality (Auto off), six readings a second apart after 14 s:

| Project | Quality 0 | Quality 1 | Quality 2 | Quality 3 | Auto |
|---|---|---|---|---|---|
| Lumen (17 files) | 13.9–14.9 ms (mean 14.2) | 9.4–10.2 (9.6) | 5.4–5.8 (5.6) | 3.0–3.3 (3.1) | 14.0–14.8 (14.2), level 0, no change |
| Self (92 files) | 14.6–14.9 (14.7) | | | 3.2–3.3 (3.2) | 14.8–15.1 (15.0), level 0, no change |
| Excalidraw (450 files) | 14.1–14.2 (14.1) | | | 2.8 (2.8) | 14.0–14.1 (14.1), level 0, no change |

60 fps throughout (one reading of 57 fps at quality 2). Another track was rendering on the same machine during some
of these readings; they agree with earlier readings of the same build within 0.5 ms. Render-lab stills (film path,
quality 0, one reading after 4 s of warm-up): 14.0–16.1 ms over the final stills of the three projects. CPU
(`updateMs`): 0.15–0.5 ms on Lumen and Self, 0.85–0.98 on Excalidraw; a full refill of the rows after a seek about 2 ms
once warm (Self, 104 rows computed, Node).

How it got there: the first version, with the relief's noise per fragment, the effects looped per pixel and a grid whose
far rows were sub-pixel, measured 34 ms; profiling by elimination found the fragment noise (about 7.5 ms), the far grid
(about 10 ms), the per-pixel effect loops (about 3.7 ms) and the fragment mist (about 2.4 ms). Everything smooth moved
to the vertices of a grid spaced for an even density on screen, the noise became a cheap hashed value noise, and the
loops run only over the active slots.

| Quality | What changes |
|---|---|
| 0 | MSAA 4× (host), grid 400×230, the relief's two finest octaves |
| 1 | No MSAA (host), grid 330×190, both octaves |
| 2 | 75 % resolution (host), grid 260×150, the octaves at 0.6; fewer motes |
| 3 | 55 % resolution (host), grid 200×115, no fine octaves, no mist noise, no stars or aurora; fewer motes |

Films always render at quality 0.

## Selection and compatibility

- `engine/recipe.js` `PREVIEWS = ['synaptic-storm', 'fractal-continuum', 'temporal-terrain']`: accepted by
  `generate({family})` and the `family` action, never part of `FAMILIES`, so the family scores and their draws are
  unchanged. Its genome comes from `rng('genome', 'temporal-terrain', …)` and its palette from its own stream.
  `RECIPE_VERSION` stays 4: the generator fingerprints of `tests/recipe.test.js` hold unedited.
- `engine/catalog.js` `PREVIEWS`: its parameters plus the common ones, no digital life, not a base for declarative
  packs. `/api/catalog` lists it under `previews`.
- `public/worlds/host.js` `BUILTIN` loads it; the host remembers a replay's recorded windows from its last prime and
  hands them to a built-in world that implements `onHistory` (packs never get them). The Visual Studio lists it after the
  other previews with an *In design* pill and a thumbnail; the web demo offers it with the other worlds (eight in all).

## What is not done

- **Not watched in motion** by a person and no film rendered: every judgement above is from stills. The flow of the land,
  the touch's dome and rings, the scan and the sunrise were only seen as single frames.
- **No artistic review** with the owner; the owner's reference images were not available.
- **The far history of a long session** is compressed by the logarithmic depth: Self's first fifteen minutes lie past
  depth 150, in the haze; the camera never travels back along the time axis (*planned*: an idle flight over history).
- **The commit's survey line** lies right behind the front edge while it flashes: it reads across the ranges there, but
  a single file's stake is small from the default three-quarter view; the lasting dotted lines read better further back.
- **The touch's rings** are faint next to its glow pool; the medium close-up gives way to failures, recoveries and
  milestone-tier events (by design), so many edits are seen from afar.
- **Roads** are arcs over the front edge, not paths in the land; in a dense project (Excalidraw: 32 roads) they read as a
  web. Intra-subsystem dependencies are not drawn.
- **A ridge's birth slope** shifts by up to about two units when its row passes from one level of the pyramid to the next
  (the levels filter over different spans).
- **Auto** was only seen holding level 0 at 60 fps; it was not seen stepping down on a slower machine. Only the AMD iGPU
  and the shader compile path were exercised: nothing was rendered on the NVIDIA adapter, in OBS, on SwiftShader at
  1920×1080, or over a long soak. The web demo and Visual Studio UI suites (`qualification/site/web-demo.qual.js`,
  `qualification/ui/workspaces/visual.qual.js`) were updated for the sixth world but not run.
- **Digital life**: none yet (no ecosystem grammar for the land); the preview offers no life parameters.
- **Generator inclusion and graduation**: as for the other previews, a new generator version would be needed to let the
  family scores choose it, and its parameters would freeze into the catalogue with curated looks and the Artist Studio.
</content>
</invoke>

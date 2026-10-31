# Fractal Continuum

An evolving 3D fractal universe drawn from the project: one raymarched, distance-estimated fractal in a black void. The
code's character picks the universe (the recursive geometry itself, not only its colours); development unfolds its
recursion; subsystems are regions of its surface and files are sites of light on it. Agents ride to the sites they
work on and ripple the surface in their own colour; tests send a coherent wave of light across the form; failures make
the covered region lose coherence; a verified milestone can earn a rare fractal bloom.

**Status.** A built-in family (`public/worlds/fractal.js`, `public/worlds/fractal-forms.js`), a preview until generator 5
graduated it: the family scores can choose it, it is a base for declarative and shader packs, the Visual Studio offers it
with two curated looks and the Artist Studio composes over it. Graduating it changed no existing identity (see
[Selection and compatibility](#selection-and-compatibility)).
The owner watched it live and found it read as "gum" (one soft purple, even soft light, shapes rounded by the swell, a
white sugar of sparkle); the finish described here (0.8.0) answers that: each region its own hue on the
identity's harmony, a hard key light with a traced shadow, deep occlusion, glassy ridges and matte depths, a gentler
swell, rare coloured glints. It has not been reviewed artistically since. Everything below marked *prototype* is
implemented; *planned* is not.

![One project, four universes](fractal-continuum-universes.jpg)

*Lumen Recipes (17 files in 6 subsystems at its end) as four identities of the same project: its generated identity, a
violet kaleidoscopic crystal (top left), and the variants 1 to 3 of the Visual Studio's regenerate: a copper Mandelbulb,
a jade Mandelbulb, a rose crystal of the Menger-like kind (a high `fractal.shape`; earlier versions of this page called it
a Mandelbox, the recipe says `kifs`). Each is a different formula or different parameters, from the identity's own
stream, and each region takes its own hue on the identity's harmony. Every still on this page: GPU (AMD Radeon iGPU
through WSL2 D3D12), rendered at 1920×1080 (the fractal itself at 0.6 of that, quality 0, see
[Performance](#performance)), shown at 960×540.*

| | |
|---|---|
| ![A large project](fractal-continuum-excalidraw.jpg) | ![Unfolding with the project](fractal-continuum-unfolding.jpg) |
| Excalidraw (450 files, 9 subsystems), its generated identity: a twisted Mandelbulb of power 8 in sapphire, indigo and teal regions, the files' 450 sites of light on them | Lumen over its recording (2 %, 15 %, 40 %, the end): the crystal's recursion unfolds as files and symbols arrive; at 40 % the first verified milestone blooms |
| ![An agent's edit](fractal-continuum-agent.jpg) | ![A failing test run](fractal-continuum-failure.jpg) |
| Claude's first recorded edit (0.5 s on): its signal (rose four-point spark) at the edited site, the surface lit in its colour around it | A failing run, 6 s on, up close: the covered region decoheres (it jumps out of shape 12 times a second), static crackles in the warning colour, the region dims |
| ![The earned bloom](fractal-continuum-bloom.jpg) | ![A passing run](fractal-continuum-wave.jpg) |
| The first verified milestone (a recovery), 2 s on: the form twists through its recursion and inflates, a white-gold shell runs over it, a burst of light leaves the surface | A passing run, 3 s on: the coherence wave sweeps the form in the valid colour (this one also earned a milestone 62 s after the first: a local unfolding, not a bloom) |
| ![A commit](fractal-continuum-commit.jpg) | ![Idle](fractal-continuum-idle.jpg) |
| A commit that names no files: a warm glow rises from the crevices of the whole form | 90 s after the last event: the form breathing, the key light circling (glints where it catches the facets), the camera drifting in toward one region |

![Tuned toward the reference](fractal-continuum-reference.jpg)

*Lumen tuned toward the owner's reference image (formula Mandelbulb, power 8, no twist, teal surface, `camera.personality`
pole: `--tune '{"fractal.form":"bulb","fractal.power":8,"fractal.twist":0,"palette.primary":"#33828e","camera.personality":"pole"}'
--at 1`): its regions teal, azure, blue and violet on the arc from the surface's hue away from the gold light, the gold
on the rims. The camera here is in the close-up of an event at the end of the recording, not at the pole: an attention
close-up overrides the pole view (see [Known gaps](#known-gaps)).*

*All stills: `qualification/visual/lab.js --dataset lumen --family fractal-continuum --gpu amd --size 1920x1080 --events
--after 2,6 --touch --idle 90 --at 1` (and `--at 0.02,0.15,0.4,1`, `--variant 1` to `3`, `--dataset excalidraw`); the
passing run on the same film path 3 s after the first recorded `validation.passed`; the tuned still as above. In a
sandboxed shell where ANGLE's GL backend finds no usable X display, the same GPU is reached through `--use-angle=gl-egl`
with `DISPLAY` and `WAYLAND_DISPLAY` unset (the renderer string still reads D3D12 AMD Radeon).*

## Mapping: what drives what

Every structure is project data from the world model (`public/worlds/model.js`) or the recipe; ambient life is labelled
as such.

| Data | Image | Notes |
|---|---|---|
| The project's traits at generation (`engine/recipe.js` `traitsOf`) | The **universe**: `fractal.form` (Mandelbulb for interface-heavy and hub-centred code, Julia bulb for function-heavy code, Mandelbox for classes, types and coupled subsystems, kaleidoscopic crystal for tested, widely branching code; a seeded share), `fractal.power` (the bulbs' n-fold branching, from the number of subsystems), `fractal.twist` (raised by cross-subsystem coupling), `fractal.shape`, `fractal.julia`, `fractal.detail` (symbols per file) | From the identity's own stream: two projects (or two variants) are two universes |
| Live code at *t*: `model.modules`, `model.symbols` (`born`, `removed`) | How far the recursion has **unfolded**: 2.5 + 0.95 × detail × log₂(1 + files + symbols / 4) iterations (fractional, blended), each file and symbol eased in over 2.6 s | An empty project is a smooth seed; by the formula Lumen goes from about 4 to 6.8 iterations over its recording, Excalidraw's 450 files reach about 11.4 (the level of detail may draw fewer, see [Determinism](#determinism)) |
| Subsystem: `model.districts` (creation `order`, `role`) | A **region** of the surface around its own direction (slot *k* of a fixed, seeded sequence whose first slots stand far apart), in its **own hue**: region *k* takes a share of the arc from the surface's hue toward the harmony's far pole (see [Visual grammar](#visual-grammar)), with its own saturation and lightness from its id | A region never moves and keeps its hue; `role` is named in labels only |
| A region's live files | The region **swells** outward (up to `geometry.swell`, log-scaled against the largest region), the amplitude halved as the recursion unfolds from 3.5 to 7.5 iterations | The radial swell keeps the surface's detail; a gentler one shears it less (an intricate form keeps its structure, a smooth seed may bulge) |
| File: `model.modules` | A **site of light** on its region's surface: a direction on a golden spiral around the region's (index *j* in creation order), traced to the surface with the JS twin of the estimator | A file never moves on its spiral; its size from its live symbols; fades in at birth, out at removal |
| File state (`stateAt`): draft, committed, validated, stressed | Site light: pale, the light's colour, the light's colour toward valid, flickering in the warning colour | Stressed also drives decoherence (below) |
| Dependency: `model.links` (`a` imports `b`) | A faint **thread** of light arcing from the importing file's site to the imported one's (lifted more between regions) | One per pair of sites, at most 480 |
| Site firings: an attributed edit (`m.lastAgent`, `m.agentVoice`), a human edit, a birth, a symbol born or modified | The site flares in the cause's colour; the pulse runs down its threads to what it imports | |
| Agent presences (`frame.agents`) and their tool events (`public/worlds/touch.js`) | A **signal** per agent (CAST seat colour and shape) and its **touch** on the surface | See [Agents](#agents) |
| Director commands (`effect`) | The vocabulary below | Never time alone |
| `director.lasting()` | An **inner light** in the crevices of the regions that earned verified milestones | Lasting; rebuilt after a seek |
| `director.activityAt` | The spontaneous pulse rate (up to 2.4× while work is recent) and whether the idle drift runs | Evaluated per beat |
| `director.unlockedAt` | Stardust (far points of light), inner light (all crevices), corona (a glow hugging the silhouette), echoes (far soft glows) | Verified milestones only |

## Visual grammar

- **Universes** (`fractal-forms.js`): a Mandelbulb of power 4 to 10 with a polar phase (twist) and an azimuthal phase
  (shape), a Julia bulb whose constant lies just inside the bulb of the same power along one of six directions, a
  Mandelbox of scale −1.5 to −2.3 whose iterations turn a little, and a kaleidoscopic IFS (octahedral folds between two
  small turns, scale 1.9 to 2.6, a cube at the end of the recursion: faceted, crystal-like). Each is normalized to the
  same bounding radius.
- **Palette** (its own stream, `fractalPalette` in `engine/recipe.js`): `primary` the surface (teal like the reference,
  blue, jade, violet, copper, amber or rose; moderately saturated, mid-dark), `secondary` its depth colour, `accent` the
  light of sites and events (warm on a cool surface or cool on a warm one, or the surface's own family), `highlight`
  rims and glints, `deep` and `haze` the void (kept dark), `warning` failure (red to magenta, at least 40° of hue away
  from the light: never the light's colour, never gold), `valid` tests.
- **Harmony** (`palette.scheme`, in `fractal.js`): the far pole is the light's hue for analogous and complementary (the
  opposite hue when the light stands near the surface's), 150° for split and 120° for triad. Regions take hues on the arc
  from the surface's hue toward it: region *k* the share `[0, 1, −1, ½, −½, ¾, ¼, −¾, 0.9, −¼]` of the arc (the first
  region the surface's own hue; a negative share toward the other side, 0.6 of the span for analogous and complementary,
  the full span to the other pole for split and triad), ±4° from its id, the span 28–40° (analogous), 100°
  (complementary, split) or 110° (triad). An arc never crosses the band between amber and green (48–100°, where a dark
  yellow reads as olive): it turns the other way round the wheel, or stops 44° short of the band. Neighbouring regions
  meet in a narrow seam, in the hue between theirs. The far pole itself stays the light's: rims, glints, sites, events.
  Lumen (violet, gold light) gets violet, crimson, magenta, rose, indigo and azure regions with gold rims; a teal surface
  with a gold light turns toward azure, blue and violet; a jade one toward teal.
- **Surface** (a jewel, not a clay): colour from the region's hue turned by the recursion's orbit (traps): the depths
  darker, denser and turned toward the palette's depth side, the ridges lighter and turned along the arc toward the far
  pole, grazing angles turned further (iridescence, up to 38°). Occlusion from three taps of the estimator along the
  normal and the orbit trap, deep enough that crevices go almost black; the second tap (a few pixels out) marks ridges
  and pores. A hard key from the side and above, a little toward the camera (Lambert, no wrap), with a soft shadow
  traced toward it (sphere tracing, the penumbra from the closest approach; 6 steps at quality 0, 4 at quality 1, two
  taps at 2 and 3); a dim fill that the crevices lose and that takes the surface's colour again where less light reaches;
  a back light in the far pole's hue on the silhouette. Materials: exposed surfaces and orbit-trap ridges are glassy and
  metallic (a sharp highlight tinted by their own colour, a soft reflection at grazing angles), the depths matte. The
  normal is taken over two pixels and the finest recursion drawn stays above two pixels, so the relief does not turn into
  a white sugar of sub-pixel highlights.
- **Glints** (ambient): rare points of light where a glassy facet catches the key, in the region's colour, twinkling on
  the beat, more of them in a region that holds more files.
- **Sites**: jewel-like points of light with a soft pool around them (additive); each tests its own visibility against
  the fractal's depth with a small tolerance, so its light spills over the relief around it.
- **Atmosphere** (never code): the void with a faint haze behind the form, a soft halo hugging the silhouette, a little
  dust.
- **Grade**: AgX, a little more contrast and saturation than the other worlds (jewel tones), bloom from a high threshold
  (only light blooms, not the surface), a faint streak; strain desaturates and cools, a bloom lifts exposure. The
  recipe's finish (Cinematic by default) applies on top.

## Layout

Pure functions of the recipe, the model and the time (`fractal-forms.js`, no THREE; pinned in `tests/fractal.test.js`):

1. **Formula**: `formOf(recipe)` gives the formula's constants; `createFormula` normalizes it (its bounding radius
   measured along 96 directions) and writes its GLSL with the same constants. The JS twin computes the same function
   (the bulb's powers by complex multiplication in both, no trigonometry).
2. **Regions**: slot *k* (a seeded sequence of directions kept to latitudes −35° to 70°, each the farthest from the ones
   before it) for the *k*-th subsystem in creation order. The sequence continues for as many subsystems as the project
   has (its first slots never move): at 49 subsystems the nearest two regions stand 19° apart.
3. **Sites**: file *j* of a region on a golden spiral around the region's direction at `geometry.spacing` (from the
   project's size at generation) × √j; its radius traced from outside along that direction at the drawn recursion,
   cached per file and integer recursion (the fractional level blends the two neighbours), scaled exactly by the
   region's swell. A ray that slips through the form tries six turned directions.
4. **Swell and colour**: an octahedral table (128²) of each direction's swell and region colour, rewritten only when the
   regions' weights or the swell amplitude change (the colours only when the regions themselves do); the shader looks
   it up per ray (every few steps), the JS evaluates the same kernels exactly (sites sit on the swollen surface at the
   same amplitude).
5. **Framing**: the whole form fills about 80 % of the frame height; a recorded event the director gives attention to
   is seen up close (the camera turns to face the event's site first, then comes in until about the form's radius
   fills the frame); an agent's edit in a medium close-up; the full bloom pulls back 25 %.

## Idle behaviour

With no input for 20 minutes or 20 hours the form stays alive, never like a screensaver: it breathes on 2, 4 or 8 bars
(`motion.breath`, a 0.6 % scale), the key light circles slowly (`motion.light`), rare glints in the regions' colours
twinkle where a facet catches it and swell on the beat (`motion.shimmer`), each site pulses spontaneously on the **beat grid** with a seeded probability per
beat (rarer per site in a large project), its pulse running down its real threads, and the camera orbits, glides or
turns around the pole (`camera.personality`). Every 190 s, while nothing happens, the camera drifts in toward the next
region and back out. Nothing grows and nothing is labelled while idle.

## Music

The world reads the performance clock and the score's expression (`frame.music`, null in a pack frame):

- Spontaneous pulses sit on the score's **beat grid** (beat *k* at *k* × 60000 / tempo of performance time), jittered off
  it by `1 − motion.sync`.
- **Energy** sets how bright spontaneous pulses are (never their schedule); the downbeat (`frame.beat`, scaled by
  `music.beatPulse`) brightens the glints; the breath follows the bars; the section tints the grade (tension warmer,
  resolve cooler, breath dimmer, lift brighter).
- *Planned*: rhythm-gated subdivisions and section onsets, as for Synaptic Storm.

## Agents

- **Each provider its own colour and shape** (CAST seat, `public/providers.js`): Claude rose four-point spark, Cursor
  cyan ring, Codex lime diamond, Grok white six-point star, Qwen azure triangle, Kimi magenta double ring, unknown
  providers amber or grey dots. Subagents are smaller. Chips show catalog names only.
- **Where it is**: just above the site of the file it works on while a tool runs on a file, or for 4.5 s after one of
  its edits lands (the model's correlated cue); otherwise circling its home site (working on a request) or farther out
  (waiting), or circling the form. Between goals it travels in spherical coordinates over 1.8 s (it never cuts through
  the form), with a trail.
- **Its touch** (the agent's own tool event, `touch.js`, or an attributed edit landing): rings in its colour ripple
  across the surface from the site, the crevices around it light up, the site flares, its threads carry the pulse, and
  the camera comes to a medium close-up of an edit. Reading is quieter (0.45 of an edit).

## Events, failure, recovery and the earned bloom

| Intent (effect) | Image |
|---|---|
| `subsystem.created` (emerge), `module.created` (seed), `structure.created` (unfold), `structure.removed` (erode) | From the model's own times: a new region's sites appear, each new file and symbol unfolds the recursion a little further, a removal folds it back |
| `subsystem.connected` (thread) | The new thread grows in over 2.4 s |
| `validation.passed` (coherence-wave) | A **coherent wave**: a bright front sweeps the whole form from the covered sites in the valid colour, a calm afterglow behind it; each covered site flares as the front passes |
| `validation.failed` (decohere) | **Decoherence**: the covered region's surface is displaced by a turbulent field that jumps 12 times a second (harder for the first 2.6 s, then while stressed), static crackles in the warning colour, the region dims, its sites flicker and misfire off the beat; the grade desaturates and cools. Never gold, never a wave |
| `validation.recovered` (recohere) | **Coherence restored**: rings converge on the repaired region in the valid colour, its sites pulse together on the next three beats, the distortion relaxes over 4 s |
| `milestone.achieved` (bloom), `refactor.validated` (refine) | The **earned bloom** or a local unfolding (below); a lasting inner light in the subject's regions |
| `repository.checkpoint` (glow) | A warm glow rises from the crevices of the committed sites (of the whole form when the commit names no files) |
| `world.expanded` (deepen) | A brief lift of exposure |

**The bloom rule.** A full bloom needs both: the director granted the milestone its tier (3 or more, which spends one of
its three spectacle tokens), and in the director's lasting record the milestone is the first or comes at least
**4 minutes of performance time** after the last milestone that could bloom (`BLOOM_GAP`). Then the form twists through
its own recursion (the bulbs' phases, the box's and the crystal's turns) and inflates 8 %, a white-gold shell runs over
the surface from the subject, light floods from every crevice behind it, 3200 points of light leave the surface, every
site flares in three volleys, the camera pulls back 25 % and bloom and exposure lift. Tier 4 (three tokens and ten
minutes) twists further and volleys four times. Otherwise the milestone is a **local unfolding**: a warm glow and two
volleys around the subject. Known approximation (as in Synaptic Storm): the gap rule reads every milestone time in the
lasting record, so a milestone the director downgraded can still hold the 4-minute gap (pinned in the test).

## Labels and privacy

Words come only from generic phrases, roles, counts, CAST catalog names and `ctx.name(id)` (the user's alias or the
generated name): "A new region unfolds", "Tests fail · 8 sites decohere", "Fractal bloom · Recovery", "Committed · the
work glows"; region labels name each region facing the camera with its role and files; inspecting a site says "A site
of Vauos · committed" with its symbols and threads. No file name, path or identifier is drawn (tested on every intent's
words and the region labels).

## Determinism

No `Math.random`, `Date.now` or `performance.now`: every value is a function of the model, the recipe, the director's
fold and the frame's time. Seeds come from ids (`hash`), spontaneous pulses from (site, beat), the decoherence field's
jumps from the quantized time. Per-frame state (surface points, site lights, thread pulses, every event slot of the
shader) is recomputed from scratch each frame, and an event slot not in use is all zeros, so the state at a moment does
not depend on what was drawn before (tested by drawing other moments first). The caches (site radii per recursion, the
swell table, the layout) hold pure functions of their keys. After a seek, transient effects are dropped and the lasting
inner light comes back from the director's record. Two things also follow the camera, as the host's camera rig follows
the frames: the level of detail (how many recursions the pixels can hold at the camera's distance) and the fractal's
share of the resolution (smaller when it fills the frame). Films seek and warm up before each still, as for every world.
The finish keeps this: region hues come from the region's id and creation order, the swell amplitude from the unfolding
at *t*, and no shading term reads the wall clock. After it, `visual/identity.qual.js --gpu amd` on Lumen, Excalidraw
and Self passed 15/15 (the same frame bit for bit after a receiver restart and after a rebuild from the journal alone).

## Performance

The fractal renders into its own targets at a share of the scene's resolution (0.6 at quality 0), in three passes drawn
right before its composite (inside the scene's frame, so the host's GPU timer counts them): a coarse cone march at half
that resolution (each cone of four pixels' radius stops where it touches the form, or proves the pixels around it miss
it), the march from there into a float target (over-relaxed sphere tracing), and the shading (with the key light's
shadow trace: about 1–1.3 ms of a frame at 6 steps, 2–2.5 ms at 10, measured on Lumen; paid for by dropping the old
large-shape normal and by the two-pixel detail threshold). The composite upsamples
it into the scene (Catmull-Rom on the colour, bilinear on the coverage) and writes its depth, so sites, threads and
signals hide behind the form. When the form fills the frame the share drops to as little as 0.8 of the quality's.

| GPU time per frame (lab `gpuMs`; AMD Radeon iGPU, WSL2 D3D12; 1920×1080, quality 0), the same stills before and after the finish | Before | After |
|---|---|---|
| Lumen (crystal), 14 stills: events at 2 s and 6 s, touch, idle 90 s, the end | 15.5–20.5 ms (mean 18.0) | 15.6–19.9 ms (mean 17.6) |
| Lumen variant 3 (rose crystal), the same 14 | 17.2–23.6 ms (mean 18.6) | 14.8–18.9 ms (mean 17.1) |
| Excalidraw (bulb, 450 sites), the end and idle 90 s | 18.7–19.0 ms | 17.6–18.4 ms |
| Self (bulb, 92 files), 6 stills; the highest a close-up filling the frame | 17.1–24.1 ms (mean 19.3) | 16.9–22.0 ms (mean 18.9) |
| Self tuned to a Mandelbox (`fractal.form` box), 6 stills; the highest the end, a close-up | 17.5–32.1 ms (mean 22.2) | 19.4–32.7 ms (mean 23.0) |
| Lumen, variants 1 and 2 at the end (bulbs, close-ups), after only | | 21.0, 22.0 ms |

Each value is the host's moving average after the lab's 4 s of warm-up (one reading per still; run-to-run noise on this
machine is about ±1 ms). Held at one moment for 60 more frames: Lumen's end 18.7 → 18.9 ms, its failure close-up
21.3 → 21.2 ms, idle 17.2 → 17.0 ms, Self's close-up 24.2 → 23.7 ms. The real player at fixed qualities (Lumen at 8×,
one reading): 17.8 → 18.1 ms at 0, 13.9 → 13.3 at 1, 7.3 → 6.7 at 2, 3.8 → 3.5 at 3.

SwiftShader (no `--gpu`, 960×540): the world compiles and draws (lab still, no GPU timer there). CPU: lab `updateMs`
0.2–1.1 ms on Lumen, 1.4–2.2 ms on Excalidraw. Draw calls in the lab: 8–9.

How the share was chosen: during development, the same framed scenes measured about 11 ms with the fractal's passes
turned off (the host's HDR pipeline, MSAA, bloom and grade, and the sprites), about 27–29 ms at a share of 0.66 and
20–24 ms at 0.6 (before the last shading changes); at full resolution, before the coarse pass and the split into
passes, 44–61 ms. The share costs sharpness: up close the surface is visibly softer than a full-resolution render.

| Quality | What changes |
|---|---|
| 0 | MSAA 4× (host), share 0.6, three occlusion taps, a 6-step shadow trace, all recursions the pixels can hold |
| 1 | No MSAA (host), share 0.54, two taps, a 4-step shadow trace, at most 12 recursions |
| 2 | 75 % resolution (host), share 0.5, two taps, two shadow taps, at most 10 recursions; less dust |
| 3 | 55 % resolution (host), share 0.45, one tap, two shadow taps, at most 8.5 recursions, no glints; less dust |

Films always render at quality 0. Live playback at Auto (1920×1080, AMD iGPU), before the finish: 53.9 fps, frame time
p95 33.3 ms, 47.7 fps in close-ups, 17.4 ms GPU per frame, Auto at the top level; the OBS overlay page the same
([QUALIFICATION.md](../QUALIFICATION.md#preview-worlds-acceptance-films-and-live-measurements-pr-28)). Not measured
again after the finish (only the fixed-quality readings above). Not yet measured: OBS on a GPU, long soak.

## Selection and compatibility

- **Generator 5** (`engine/recipe.js`, `RECIPE_VERSION` 5) graduated it from `PREVIEWS` into `FAMILIES` (`GRADUATED`).
  Its score, from its own random stream (`rng('family', 'fractal-continuum', seed, variant)`) after the flagships'
  unchanged draws: symbols per file beyond four (1.0 at twelve), a function share beyond 45 % (0.9 at 85 %), few
  subsystems (0.5 for one, nothing from seven) and little UI surface (0.3, gone at a third of the files with components):
  one intricate recursive form, whose recursion unfolds with the symbols and whose regions are the subsystems, suits
  dense, formula-like code in a few subsystems; component code grows organisms instead. Over the synthetic corpus of
  `tests/generator-v5.test.js` it is chosen for 13.9 % of projects, most of them algorithmic cores, data pipelines and
  command-line tools ([WORLDS.md](../WORLDS.md#from-data-to-identity)); none of the three datasets is one.
- **No existing identity changes.** Generator 4 scores the flagships alone, with the same draws: every v4 value is as
  pinned (`tests/recipe.test.js`, and `tests/generator-v5.test.js` against the generator at 1226b8a). An identity stored
  by generator 4 is redrawn with 4 (`generatorOf`), so it never becomes a Fractal Continuum by itself; choosing it,
  regenerating or going back to automatic is a new identity on generator 5. A recipe that chose it before graduation is
  served as stored (its name still says "(preview)", without digital life).
- Its genome comes from `rng('genome', 'fractal-continuum', …)` and its palette from its own stream, as before; a new
  identity also gets `genome.life` from `rng('life', 'fractal-continuum', …)` (enabled, ecology 2), which draws nothing
  until the world has an ecosystem grammar.
- `engine/catalog.js` `FAMILIES`: its parameters plus the common ones, frozen (added to, never removed or narrowed),
  so a declarative or shader look can name it as its base. `/api/catalog` lists it under `families`; `previews` is empty.
- `public/worlds/host.js` `BUILTIN` loads it; the Visual Studio lists it with the flagships (thumbnail, the code's-match
  star, two curated looks: *Teal Mandelbulb*, the owner's reference tuning, and *Kaleidoscope crystal*, and an
  Essentials group), and the Artist Studio offers it as a base.

## Known gaps

- **Sharpness**: the fractal is drawn at 0.6 of the resolution (0.48 when it fills the frame) and upsampled; the finest
  relief is softer than a full-resolution render. The crystal's small facets still glitter where the key's highlight
  falls on them (tinted by their region, no longer a white coat over the whole form).
- **Region hues on screen**: a region's hue is fixed, but the camera usually sees two or three regions; an identity
  whose harmony is narrow (analogous) stays within about 40° of its surface's hue by design.
- **A Mandelbox late in a large project** is the costliest form (32 ms in Self's end close-up, before and after the
  finish); no default identity of the datasets tried draws one.
- **The pole view** (`camera.personality` pole, the reference's pose) gives way to event close-ups and the idle drift,
  which turn the camera toward their region.
- **Sites on very rough surfaces** can be hidden by the relief around them (a visibility test with a small tolerance);
  during a bloom's twist and in a decohering region they follow the base shape, so they float a little off it.
- **Threads** are arcs over the surface; in a dense project they can read as lines drawn over the form.
- **Julia constants**: six directions near the bulb's surface; only some were looked at.
- Only the AMD iGPU and SwiftShader were tried; nothing was rendered on the NVIDIA adapter, in OBS or at Auto.

## Path to shipping

1. **Artistic review** with the owner against the reference; films of whole sessions (`qualification/visual/film.js`)
   rather than stills; a pole still at rest.
2. **Sharpness and cost**: a temporal-free way to recover detail (an adaptive share by the form's coverage is in place;
   a cheaper estimator or a precomputed distance field for the approach could buy a larger share), measured on the
   target machines at Auto, in OBS and over a long soak.
3. **Qualification parity** with the three families: `catalogue.qual.js` and `worlds.qual.js` (determinism across seeks,
   idle, privacy of every label, resources) now cover all six families; see
   [QUALIFICATION.md](../QUALIFICATION.md) for what was run.
4. **Agents**: travel along the threads between sites, `agent.collision` as two signals meeting.
5. **Music**: rhythm-gated subdivisions and section onsets.
6. **Digital life**: a grammar for the surface (drifting motes of light gathering at active sites, avoiding decohering
   regions), behind the recipe's `life` values; until then the preview has no ecosystem and offers no life parameters.
7. **Generator inclusion**: done in generator 5 (above).
8. **Graduation**: done with generator 5: in `FAMILIES`, its parameters frozen in the catalogue (a base for packs),
   curated looks and Essentials, the Artist Studio. The curated looks have not been reviewed artistically.

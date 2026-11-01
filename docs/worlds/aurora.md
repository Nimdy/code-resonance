# Aurora

A polar night over a frozen lake, and the software is the aurora. Each subsystem is a curtain of light hanging across
the sky, folded like a drapery, its files the fine rays inside it; agents are wisps that fly up from the ice to the rays
they edit and ignite them. The lake is mirror ice, so everything above is doubled below: in a vertical clip, a tall sky
over its reflection. Mountains stand on the far shore, their snow lit by the aurora's own colour; a cabin with one warm
window sits on a point of the near shore, and every verified milestone leaves a lantern beside it.

**Status.** A preview (`public/worlds/aurora.js`, `aurora-layout.js`, `aurora-glsl.js`): built in, chosen only
explicitly (the Visual Studio, where it carries an *In design* pill; the render lab's `--family aurora`; the web demo),
never by the automatic choice. Adding it changed no existing identity (see [Selection and
compatibility](#selection-and-compatibility)). The owner watched it on films and accepted it, and then its digital life (2026-11-01; see [What is not
done](#what-is-not-done)). In 0.9.1 it became inhabited (see [Digital life](#digital-life)): foxes, hares and a snowy owl on the shore, faint light under the ice.
Everything described here is implemented unless marked *planned*.

![Self at the end of its session](aurora-hero.jpg)

*Self (92 files, a 20-minute recorded session) at its end: its curtains across the sky in greens and
teals on its harmony, each with a bright lower edge and its rays reaching high with violet at their tops, the cabin on
the point among its spruces, and the whole night mirrored in the ice. Every still on this
page: GPU (AMD Radeon iGPU through WSL2 D3D12, ANGLE's EGL backend), the render lab on the film path at quality 0,
1920×1080 (portraits 1080×1920), with Cinematic labels; one was cropped (stated below).*

| | |
|---|---|
| ![A vertical frame](aurora-portrait.jpg) | ![The corona](aurora-corona.jpg) |
| Lumen Recipes (17 files; six curtains, its tests among them) at the end, 9:16: a tall sky over its reflection, the cabin with the two lanterns its verified milestones left, their light doubled in the ice | The recovery, 2.5 s on, 9:16: the sky gathers into a corona overhead (rays of uneven length converging on the magnetic zenith, green at their foot, magenta toward the zenith, their lower ends dissolving into the dark), the camera looks up, the land and the snow light with it; in Lumen the same moment earns the breakup |

| | |
|---|---|
| ![The opening](aurora-opening.jpg) | ![Excalidraw](aurora-excalidraw.jpg) |
| Lumen at 6 %: the first curtain kindles; two Claude sessions' wisps fly toward their work, reflected in the ice; the Milky Way, faint, upper left; the snow by starlight | Excalidraw (450 files in 9 subsystems, one baseline window), 30 s after its last event: a teal identity, its curtains dense with rays; its 32 field lines are at rest, so they do not show |


## Reading the sky

- **A curtain is a subsystem.** A sheet of light hanging along the magnetic field: a sharp, bright lower edge (its hem
  and a short fringe of light over it), then rays carrying the light upward with dark sky between them, fading into a
  violet to magenta fringe toward the top. Below the lower edge the sky is what it would be without the curtain. Its hue
  is the subsystem's own on the identity's harmony, always within the greens and teals an aurora's foot can be. Its
  length grows with its files.
- **A ray is a file.** Brighter streaks at fixed places along the curtain, as tall as the file's live symbols make them;
  between them, the aurora's own finer rays (ambient). A new file's ray ignites: a pulse runs up it. A removed file's
  ray fades over 1.6 s.
- **Depth is order of birth.** The first subsystem's curtain hangs straight across the lake at the middle distance; the
  later ones alternately right and left, nearer and farther. A nearer curtain stands higher in the sky; a far one is a
  low arc over the mountains, dimmed by the air near the horizon.
- **Brightness and motion are the work.** The director's activity and the music's energy brighten the curtains and
  deepen a fast fold: a quiet arc becomes a substorm. A curtain whose files were edited lately is brighter still.
- **Long, gentle arcs between curtains are dependencies**: field lines from the importing ray to the imported one.
  At rest they are barely there (with many dependencies, not drawn at all); one shows while it draws itself in, behind a
  pulse when the importer's file fires, and behind a wisp flying along it, fading after.

## Mapping: what drives what

Every structure is project data from the world model (`public/worlds/model.js`; in a replay the whole recorded
history, see [Determinism](#determinism)) or the recipe; ambient life is labelled as such.

| Data | Image | Notes |
|---|---|---|
| Subsystem: `model.districts`, in order of birth | A **curtain** across the sky in its own hue on the identity's harmony; ranks 0–9 take composed places (azimuth 0°, 15°, −17°, 29°, −31°, …; depth alternately nearer and farther), later ranks low-discrepancy places | A curtain's place depends only on its rank and id: a new subsystem never moves an older one. At most 48 are drawn |
| A curtain's files | Its **length**: 760 world units plus `aurora.spacing` per file (eased as files arrive), halved for a kindling curtain | `aurora.spacing` (12–160) comes from the project's size at generation, so 17 files and 450 both fill the sky |
| File: `model.modules`, in order of birth inside its subsystem | A **ray** at its own slot (alternately right and left of the curtain's first ray, at the spacing, ±18 % jitter from its id) | It never moves along its curtain |
| Symbols: `model.symbols` (born, removed) | The ray's **height**: 0.4 + 0.6 · log₂(1 + symbols)/5 of the curtain's height | The curtain's top follows its rays (a smooth envelope); between them it falls to 0.36 |
| File born / removed | The ray **ignites** (a pulse runs up it in pale green, 3.6 s) / **fades** (1.6 s) | From the model's own times |
| File state: stressed | The curtain turns **storm-red** around the stressed rays (their neighbourhood of 1.6 spacings + 70 units): deep red, a ragged lower edge, a faster flicker, its folds deeper | Sets in over 1.5 s, stays while stressed, clears over 2.5 s after the files pass |
| File state: validated | A pale valid tone at the hem near the ray | |
| Dependency: `model.links` across subsystems | A **field line**: a long, gentle arc (a cubic from a third of the way up each ray, lifted along the field by a sixth of its span) | At most 32, newest first. At rest a trace (alpha 0.005, less the more there are: with more than about 11 it is not drawn); draws itself over 2.4 s and settles to rest over 4 s; fades over 1.6 s; a pulse runs along it when the importer's file fires, the line lit behind the pulse; a wisp flying along it lights it behind itself (its wake, about 2 s) |
| Agent presences (`frame.agents`) and their tool events (`touch.js`) | A **wisp** in the agent's CAST colour and shape | See [Agents](#agents) |
| Director commands (`effect`) | The vocabulary below | Never time alone |
| `director.lasting()` | A **lantern** on the shore for each verified milestone (a smaller candle for a validated refactor), in order of first occurrence, at most 8 | Lasting; rebuilt from the record after a seek |
| `director.unlockedAt` | Airglow, a richer Milky Way, diamond dust in the air near the shore, hoarfrost glinting on the snow and ice | Verified milestones only, in that order |
| `director.activityAt`, the score's energy (`frame.music`) | The curtains' brightness and the fast fold's depth; the rays' faster set | A quiet arc versus a substorm |
| The host's musical clock (`ctx.musicAt`, per bar) | Ripples along the curtains on the bars, the rays' shimmer on the eighths, a surge at a section's onset | See [Music](#music) |
| Edits (`lastAgent`, `lastHuman`) | A curtain with recently edited files is brighter (decaying over about 24 s) | |

## Visual grammar

- **The curtains** (`aurora-glsl.js` `CURTAIN_VS`, `CURTAIN_FS`): one mesh for every curtain, columns shared out among
  them (1,920 at quality 0, 48–224 a curtain, plus the corona's ring), rows only where light can be: each column's
  strip reaches as high as its rays. A curtain's trace is a line across the sky, leaning off east-west (the first
  curtain by 50–65°, so it sweeps from the horizon up into the sky; the others by 9–30°) and bowing away from the shore
  at its ends. Its rays run along the magnetic field, which leans north toward the magnetic zenith at 77°: in
  perspective they converge toward it. Three folds of the sheet (wavelengths of about 600, 220 and 90 units: a slow one,
  a middle one and a fast one) move along it; the slow one makes the long S-curves and the edge-on pleats, the middle
  and fast ones are shallow at rest (so a lower edge is a smooth line, not a jagged one) and deepen with the work. They
  ease toward the ends, and their depth scales with the curtain's distance so every curtain folds through about the
  same angle; a far, low curtain folds less.
- **The light of a curtain**: a thin bright hem and a short fringe of diffuse light over it (falling off over about a
  thirtieth of the curtain's height), with knots along the lower edge (brighter and dimmer stretches drifting); above
  it the light is in the rays, which carry it upward with dark sky between them; toward the top, the fringe colour, in
  the rays. Below the lower edge the curtain adds nothing but its rays' slight dip and the low air's glow (the sky's
  lobes): stars show there and the airglow runs on down to the mountains. Rays come from a striation texture of discrete
  rays of varied width (two drifting sets; the faster takes a larger share as the work quickens; mipmapped, so on a far
  curtain they average out instead of shimmering), with broad bands varying their strength along the curtain, and
  flicker along their length. A far, low curtain (its lower edge under about 11.5° up, fully below 6.3°) is seen through
  more air: its foot is soft and broken by its rays, with no hem line. Where a fold
  turns edge-on the sheet is brighter (the line of sight runs through more of it, up to three times). The ends and the
  top fade over a long, perceptual distance: under the tone curve a tenth of a bright curtain still shows.
- **The lens**: chromatic aberration is on by default, as a night sky photographed through a real lens. The world's
  grade asks for `aberration` 0.008, twice the finish's designed fringe (with the Cinematic finish an optical fringe of
  0.6 % of the image height in the corners, about the Dreamlike finish's), so the bright rays carry red and cyan edges
  toward the corners. `technique.aberration` tunes it in the Visual Studio, and 0 turns it off.
- **Palette** (its own stream, `auroraPalette` in `engine/recipe.js`): the curtains' foot (`primary`: emerald, green or
  teal, 124–180°), the fringe (`secondary`: violet to magenta, 270–330°), the cabin's and the lanterns' warm light
  (`accent`), pale snow and stars (`highlight`), the night (`deep`, `haze`), `warning` a deep red at least 40° from the
  warm light (a storm is never gold), `valid` a pale cyan-green.
- **Harmony**: curtain *k* takes the hue at share `[0, 1, −1, ½, −½, ¾, −¾, ¼, −¼, 0.9, −0.9]` of a small span around
  `primary` (9° analogous, 13° complementary, 16° split, 18° triad), ±3° from its id, clamped to 116–168°; its fringe
  the mirrored share around `secondary`, clamped to 262–334°.
- **The lake**: mirror ice. The night is drawn mirrored in the ice plane into a reflection target (a third of the frame's
  resolution at qualities 0 and 1; only the part of the frame below the horizon; skipped when no ice is in view),
  sampled with a gentle distortion from the ice's undulation and a glossy blur along the vertical (lights draw streaks),
  weighted by Fresnel (near the camera the ice reflects little and shows its own dark surface and a faint sheen of the
  aurora's light). Drifted snow in long wind-aligned patches with sastrugi and a thin dusting around them; faint
  wandering cracks in some places, catching the light, fading with distance.
- **The land**: a spruce treeline along the far shore; two to five mountain layers on arcs around the lake, each
  farther, taller and paler, now and then a massif standing above its range (their snow on the upper slopes and
  shoulders, gullies down the fall line, bare rock on the steepest faces, lit by the aurora from across the lake, the
  farther ones melting into the horizon's glow); the near bank at the camera's feet
  and a point running out toward the cabin, snow over a heightfield; a few spruces on the point (camera-facing
  silhouettes with snowy tiers); the cabin (log walls, a snowy gable roof, a chimney with faint smoke, one warm window
  that casts a pool of light on the snow and a streak in the ice).
- **The sky**: a gradient from the deep zenith to a paler horizon, airglow, the Milky Way (its dust lanes), stars
  (points at infinity, twinkling more near the horizon), all wheeling about the celestial pole; the aurora's own light
  in the low air around its curtains (soft lobes, strongest below and around the lower edges). The sky is dithered
  against banding.
- **The aurora's light on the world**: one colour and direction, from the curtains' brightness, colour and apparent
  size, lights the snow, the mountains, the cabin's roof and the trees' snow, and tints the far air.
- **Grade**: AgX, bloom from a moderate threshold (the curtains glow, the snow does not), a slight cool tint; a storm
  tilts it a little warm and desaturates; a breakup lifts exposure and bloom and flashes. The recipe's finish
  (Cinematic by default) applies on top.

## The lower edges

The first version's stills showed a dark band under the curtains whose jagged top followed their lower edges exactly,
like extra mountain ranges stacked in the sky. Rendering the same frame with the curtains hidden (Excalidraw, the
film path near its end) showed the band was never dark: under each lowest edge the sky measured the same with and
without the curtains (the median difference over 18 columns 0.6 of 255 in sRGB luma, larger only where another curtain's
rays cross). The cause was above the edge: a bright band falling off over a tenth of the curtain's height, a dim body
falling off over almost half of it with a constant floor, and the files' rays adding a broad fill, made each curtain a
lit slab 3–5 times brighter than the sky; its thin hem was hardly brighter than the slab (the edge's luma 1.25 times
the light 30–70 px above it, median), so the edge read as the bottom of a lit shape, a silhouette, and stacked curtains
gave stacked silhouettes. Now the diffuse light is a short fringe over the hem and the rest is in the rays: in the same
frame the edge is 1.44 times the light above it (median), and the sky under it is the curtain-free sky or brighter
(median +14 of 255, at most +25: the farther curtains' rays crossing it), never darker. Far, low
curtains have soft feet without a hem, and the middle and fast folds are shallow at rest, so a lower edge is a smooth
fringe rather than a jagged ridge.

## Layout

Pure functions of the recipe, the model and the time (`aurora-layout.js`, no THREE; pinned in `tests/aurora.test.js`):

1. **The model's history** (`prepare`, shared with Temporal Terrain's `terrain-layout.js`): per file its birth,
   removal, symbol births and removals, and state segments, sorted.
2. **The curtains at a moment** (`curtainsAt`): each subsystem with a live file, in order of birth, with its place
   (`placeOf`: distance, azimuth, tilt, lower-edge altitude 235 ± 8 % units (up to 24 % lower for the farthest, so they
   rise from behind the far shore), height 560 · `aurora.height` ± 14 %, a fold seed), its half-length, and its rays
   (signed place along the trace, how alive, live symbols, height, storm and validated shares). Every birth and removal
   rises over a fixed span (2.6 s for a ray, 1.6 s for a fade), so nothing pops.
3. **The folds** (`foldAt`, the JS twin of the vertex shader's `fold`; `curtainPoint`): a ray's foot, a wisp's goal, a
   field line's ends and a label stand exactly where the shader draws the sheet.
4. **Field lines** (`fieldLine`), **lantern places** (`lanternAt`: along the point's lake shore, from near the cabin
   back toward the bank), **the land** (`mountainLayers`, `shoreOf`, `landHeight`: seeded value noise), **meteors**
   (`meteorOf`, `idleMeteors`) and **the breakup rule** (`breakupAllowed`).
5. **Per frame** (`aurora.js`): the curtains' parameters into a small float texture (8 texels a curtain), and their rays
   into two 512-texel rows a curtain (the top envelope, the files' rays, storm and validated shares; the ignitions'
   colour and height), which the shaders sample.

## Agents

- **Each provider its own colour and shape** (CAST seat, `public/providers.js`): Claude rose four-point spark, Cursor
  cyan ring, Codex lime diamond, Grok white six-point star, Qwen azure triangle, Kimi magenta double ring, unknown
  providers amber or grey dots; a soft halo and a trail of where it was. Chips show catalog names only.
- **Where it is.** Waiting (connected, waiting, dormant, or not busy): hovering low over the ice in front of the shore,
  a will-o'-the-wisp doubled in the mirror. At work on a file (while a tool runs, or for 4.5 s after one of its edits
  lands): at that ray's foot, a little toward the shore, a thread of its colour up the ray. Busy without a file:
  circling under its home curtain.
- **Its touch** (its own tool event, `touch.js`, or an attributed edit landing) **ignites the ray**: a pulse of its
  colour runs up the ray to its top and the ray stays lit behind it for about three seconds; reading is quieter. The
  camera leans in toward the ray and closes a little, unless a failure, a recovery or a milestone-tier event holds it.
- **How it travels.** A move begins where the wisp is (where it was the moment before its goal changed, computed by the
  same function, at most 32 changes back), so a change that interrupts a move (a tool reported for 40 ms, then work)
  never makes it jump (tested: the largest step in 50 ms stays under 120 units; with the look-back disabled it was 908).
  Between curtains joined by field lines (at most three, breadth first), once it had reached its previous goal, it flies
  along them (1.8 to 4.5 s at 520 units a second); a change that keeps its goal at the same ray lets it fly on along the
  lines it is on; otherwise it flies a lifted arc up through the night. Along field lines it leaves a **wake**: the
  stretch of line it has flown lights behind it in its colour and fades (about 2 s after it passed); the wake of a move
  cut short by the next one fades on from where it ended. Both come from the same look-back, so they are as pure as the
  wisp's place (tested: during and after a journey between two curtains the line is lit, and 20 s later nothing is).
- **Subagents** are smaller (0.6) and tethered to their parent's wisp by a faint filament in their colour (a shallow arc),
  a bead of light running down it from the parent every five seconds, while the data names the parent and the parent
  has not ended.
- **Two agents on one file** (`agent.collision`; the director gives it the family's integration look, `field-line`):
  each wisp runs in toward the ray's foot from its own side over 1.2 s; where they meet a ring in both colours spreads.
- Real data: in the Lumen Recipes recording no agent moves between two curtains that a field line joins (a scan of the
  whole performance at 4 frames a second, on the final code); such journeys were seen only in the tests and in one
  constructed scene (below).

## Events, failure, recovery and the earned breakup

| Intent (effect) | Image |
|---|---|
| `subsystem.created` (kindle) | A new curtain kindles: it grows from its middle and brightens, a surge runs along it |
| `module.created` (ray), `structure.created` (brighten), `structure.removed` (fade) | From the model's own times: a new ray ignites, a ray grows taller (with a surge along its curtain), a ray fades |
| `subsystem.connected` (field-line) | The field line draws itself from the importer over 2.4 s |
| `validation.passed` (pulsate) | **Pulsating patches** sweep the covered curtain from one end to the other: patches of pale green-cyan light blinking on and off behind a moving front, for about six seconds |
| `validation.failed` (storm) | The covered curtain turns **storm-red** and ragged around the stressed rays, and stays so while they are stressed; red embers fall from its lower edge as it breaks. Never gold, never a sweep |
| `validation.recovered` (corona) | **The sky gathers into a corona**: a barely folded ring overhead whose rays converge on the magnetic zenith, green at their foot and the fringe colour toward the zenith. It has no sheet at its foot: its rays (twice as dense as a curtain's, with a little glow between them) start at uneven heights and dissolve downward, and their lengths vary along the ring. It gathers over about two seconds (the ring contracts), holds, and settles over four (it widens and fades); the camera looks up into it and the land lights with it |
| `repository.checkpoint` (meteor) | A **meteor** crosses the sky (its direction from the commit's moment) and the cabin's window flares |
| `milestone.achieved` (breakup), `refactor.validated` (settle) | The **earned breakup** or a glow on the subject's curtain (below); a lantern (a candle for a refactor) stays on the shore |
| `world.expanded` (widen) | The view widens a little and a surge runs along every curtain |
| `agent.collision` (the integration look, `field-line`) | Two wisps meet at the shared ray (see [Agents](#agents)) |

**The breakup rule.** As the other worlds' rare events: a breakup needs the director's milestone tier (3 or more, one of
its three spectacle tokens) and, in the director's lasting record, the milestone is the first or comes at least **4
minutes of performance time** after the last one that could earn one (refactors do not count). Then every curtain
brightens (up to 2.6×) and folds faster, their fringes strengthen, a corona storm opens overhead, the camera looks up and
widens, exposure and bloom lift and the frame flashes, for about 16 s. Otherwise the milestone is a glow on its curtain.
In Lumen Recipes the first verified milestone (a recovery) earns it, together with the recovery's corona.

| | |
|---|---|
| ![A failing run](aurora-storm.jpg) | ![An agent's touch](aurora-touch.jpg) |
| A failing run, 2.5 s on (Lumen): the covered curtains turn storm-red around their stressed rays, their lower edges ragged, red doubled in the ice; the label says so; they stay red until the files pass | An edit, 0.5 s on (Lumen): Claude's wisp at the ray it edits; a ray touched a moment before, under the near curtain to the left, still lit in its colour (faint: the ignition is a thin streak among bright rays) |
| ![Lanterns](aurora-lanterns.jpg) | ![A wisp on a field line](aurora-path.jpg) |
| Lumen 20 s after its last event (a crop, 960×540 of the 1920×1080 frame): the cabin's window and the two lanterns of its verified milestones on the point, their streaks in the ice | **A constructed scene**: a scratch copy of the Lumen recording with a session added that edits files in three subsystems, about 1.5 s into its journey: *Claude 2* flies along the gentle arc of the field line between two curtains, its trail and the line's wake behind it. The recorded datasets never move an agent between curtains a field line joins |

*Stills: `qualification/visual/lab.js --dataset self --family aurora --at 1`, `--dataset lumen --family aurora --at
0.06,1 --touch --idle 20 --events --after 2.5 --warm 6` (and `--size 1080x1920`), `--dataset excalidraw --idle 30`; the
constructed scene with `--dataset <scratch copy> --at 0.9104`.*


## Idle behaviour

With no input the night stays alive and nothing grows: the curtains drift slowly about their places (tens of units over
minutes) and keep folding (the slow and middle folds never stop), their rays drift and flicker, their knots move along
the lower edges; the stars and the Milky Way wheel about the pole (`sky.wheel`); an occasional meteor crosses the sky (on
a lattice of 19 s of view time, a little over a quarter of the slots, a pure function of the view time); the ice's
reflection moves gently; smoke rises from the chimney; the camera breathes (a little sway and height, `camera.drift`).

## Camera

From the shore, low and wide across the lake toward the sky: the camera stands at the water's edge (3.1 units up for
*shore*, 1.35 for *low*, 6.4 and a wider lens for *wide*), the horizon at about 35–40 % of the frame's height, so the sky
takes the top and its reflection the bottom; it looks toward the curtains' brightness-weighted middle. Portrait frames
(9:16) use a narrower lens across, so the curtains fill the tall sky and their reflections fit below; the view leans
less toward the curtains, so the cabin stays in frame. Events lean the view toward their curtain and close in a little;
the corona and the breakup look up toward the magnetic zenith (in landscape the horizon leaves the frame for a moment).
The host's rig eases a target ahead of the shore along the view; `afterCamera` puts the camera back on the shore looking
at that target, so it never leaves the shore however the rig's springs meet, and an Explorer selection draws the view
toward what is selected.

## Music

With the host's musical clock (`ctx.musicAt`, a pure function of the performance's frames; absent in a pack frame or
headless), read per bar as in Synaptic Storm:

- **Ripples.** Each bar sends a ripple along the curtains (alternating directions, seeded per bar), as deep as that bar's
  dynamics (read at its own bar, so a ripple under way never changes), scaled by `motion.ripple` and
  `music.reactivity`; the last four bars' ripples are live.
- **The eighths.** The fine rays shimmer on each off-beat eighth as strongly as the arrangement plays rhythm in that
  eighth's bar, decaying within the eighth (`motion.shimmer`).
- **A section's onset.** A surge of brightness runs along every curtain (alternating directions), fading over six
  seconds.

Pinned in `tests/aurora.test.js` against a stub clock; not seen or heard in a film with the score.

## Digital life

Life on the shore, the snow and under the ice, reacting to the sky and to the work. The grammar is
`public/worlds/life/aurora.js` on the shared simulation ([LIFE.md](../LIFE.md): the contract, determinism, checkpoints,
generations); the world draws it behind the recipe's `life` values. Off (or absent) the world is exactly as it was
before: no ecosystem, resource, uniform, draw call or shader text (pinned against fe95cc0, 0.9.0, in
`tests/life-aurora-world.test.js`: every shader, uniform, texture, buffer and draw range, the grade and the camera, in a
landscape and a portrait frame).

**New identities live; stored ones keep what they had.** Generator 5 draws `genome.life` for a new Aurora identity from
its own random stream (`rng('life', 'aurora', …)`: enabled, ecology 2, the per-project character of `density`,
`vitality`, `collective` and `trails`), exactly as it does for the graduated worlds, so no other value of any identity
changes and `RECIPE_VERSION` stays 5. Aurora is a preview chosen explicitly, but whoever chooses it chooses the world,
and every other built-in world's new identities are inhabited. An Aurora chosen in 0.9.0 has no `life` and keeps none:
it is served as stored, and a redraw without a look keeps none (an identity with life from a tuning keeps exactly that);
the Visual Studio's Essentials for Aurora carry the *Digital life* switch, which turns it on or off. The catalogue lists
the standard `life.*` group on Aurora's entry.

![Self at its end, inhabited](aurora-life.jpg)

*Self at its end (life on, ecology 2, the generator's own life values): three white foxes trotting out on the mirror
ice, doubled in its reflection; faint glimmers lying in the clear ice beneath the curtains, in their colours; the cabin
on its point.*

![Foxes on the ice, at full resolution](aurora-life-foxes.jpg)

*A detail of the still above (1080×390 of the 1920×1080 frame, uncropped pixels): the foxes trot with their brushes
out, the glimmers' small flat lights around them.*

| | |
|---|---|
| ![A vertical frame](aurora-life-portrait.jpg) | ![The recovery's bloom](aurora-life-bloom.jpg) |
| Lumen at its end, 9:16: three foxes, small (one by the lanterns' reflection, two farther out on the ice), the glimmers faint in the ice | The recovery, 20 s on, 9:16: the light under the revived curtains blooms (a soft glow in the ice, the glimmers coming back); the owl, small at the left, gliding back from its flight |
| ![A failing run](aurora-life-storm.jpg) | ![The owl under the corona](aurora-life-owl.jpg) |
| A failing run, 3.5 s on (Lumen): the curtains to the right turn storm-red and the light under them thins out as the glimmers leave; two foxes, small left of the centre, on their way to shelter by the cabin | The recovery, 12 s on, 9:16 (540×304 of the frame, uncropped pixels): the owl, off the cabin's roof, flying out under the corona, a small silhouette |

*Stills: `qualification/visual/lab.js --gpu amd --family aurora` with `--dataset self --at 1`, `--dataset lumen --at
1 --size 1080x1920`, `--dataset lumen --events --size 1080x1920 --after 5,12,20 --warm 22` (the recovery's) and
`--dataset lumen --events` (the failure's); AMD Radeon iGPU through WSL2 D3D12, film path, quality 0.*

**The frame** is the world's own ground plane: x and z as `aurora-layout.js` lays out the lake, the point and the cabin
(about a metre a unit; the camera at the water's edge at (0, 6) looking north), y the height above the snow or the ice
for the animals, the owl's height above the ice, and for the glimmers their depth below it. A fox or a hare is drawn on
the land as `landHeight` gives it, or on the ice.

**Who lives there** (120 slots; `life.density` the share that live):

- **Foxes** (6): arctic foxes. They trot along the shore of the cabin's point (the part the camera sees) and out onto the
  ice in front of it, often to the light under a lively curtain (they are curious about it), and follow the tracks they
  and the others left in the snow. They pause to sniff, sit to look up at a bright curtain (a lively one: its subsystem
  strong, new, nourished or lasting, the energy the work leaves under it; a new curtain draws every fox's eyes for its
  first seconds), and lie down to rest. The first of each slot (a new ecosystem's population) is out on the ice; later
  ones come from the woods at either end of the shore, out of the frame, and old ones go back there to end. A mild
  interest in hares.
- **Hares** (6): snowshoe hares, each by a spruce of its own on the point, hopping a few metres at a time and sitting
  still between hops; now and then one moves to another spruce near the cabin; they flee a fox.
- **The owl** (1): a snowy owl on a spruce's top, the cabin's roof ridge or its chimney, gliding low between them now
  and then.
- **Glimmers** (the rest, about 107): faint bioluminescent life under the ice. They drift with a slow current under it (a
  gyre about the lake's middle, turned by the music's swing), gather beneath the liveliest curtains (winner-take-more,
  never more than a site carries), circle there feeding on the energy the work leaves, drift on, and part under a fox's
  steps.

**Habitat** (after each recorded window, a pure function of the model and the moment): a site per curtain on the near
ice, 15 to 39 units from the shore along the curtain's bearing (spread a little wider than the curtains stand, so the
gatherings stand apart; a nearer curtain's nearer), never under the land: from the shore the light under the ice lies
in the curtain's reflection, beneath it, in its colour. A file's or a subsystem's events land on its curtain's site.
The shore (the path along the point's lake edge, the woods, the spruces, the cabin, its roof, the perches) comes from
the recipe's own layout (`sprucesOf`, `cabinOf`, `shoreOf`), constant for the identity.

**Reactions** (conditions, never choreography: the driver's influences set site conditions; nothing places an
inhabitant). Measured in Node on four subsystems (`tests/life-aurora.test.js`):

| Event | What the ecosystem does | Measured |
|---|---|---|
| A failing run (the curtain storm-red; its site strained) | While any site is strained the animals shelter toward the woods and the cabin: foxes trot to the cabin's lee or the foot of the spruces and lie down there, hares crouch under their spruces, the owl takes the cabin's roof. The glimmers leave the strained site (its disturbance) and its light dims (the world also dims it by the strain) | every young fox sheltering 20 s on, their distance to shelter 104 → 71 units (109 without the failure); the strained site's glimmers 0 (38 without) |
| Recovery (the corona; the strain cleared) | The site revives (a condition fading over about 25 s): the owl takes off and flies out over the near ice in a wide circle 7–12 units up before it perches again; the foxes come out of shelter and sit to look up; the glimmers come back to the revived site and its light blooms (the energy the recovery leaves) | the owl over the near ice within 20 s; the revived site's glimmers 33 half a minute later (33 without the failure) |
| A new subsystem (a curtain kindles) | The foxes stop and look up at it | summed over ten samples a second apart: 37 foxes looking at the new curtain, 0 at another |
| Edits, passing runs, new files, commits | Energy and nourishment at the site: its light and its appeal to glimmers and to curious foxes | |
| An agent's wisp passing low | A fox turns to watch it: its drawn heading turns toward the wisp, and one that was sniffing sits up (presentation only: the ecosystem never reads agents) | in 344 frames with a fox within 18 units of a low wisp, 306 drew it turned toward it (`tests/life-aurora-world.test.js`) |

Over a run the foxes are within the landscape frame's fan 89 % of the time and within 60 units of the shore 95 %,
sitting to look up 23 %; hares within 16 units of their spruce 96 %; the owl perched 93 %; the glimmers per site follow
the curtains' strength (26, 49, 13 and 9 for weights 0.59, 0.83, 0.43 and 0.49).

**The music** (ecology 2, `life.music`) reaches them as in the other worlds, as conditions each species feels its own
way: foxes exploration and activity (farther excursions, a livelier trot), glimmers gathering, exploration, cohesion
and the current (and the turning attractor moves which curtains' sites appeal), hares and the owl hardly at all; the
drawing follows `musicLook` (the glimmers' brightness and size, the light under the ice, how long the tracks show).
Ecology 1 has its own slow climate.

**What the world shows.** Foxes, hares and the owl as silhouettes (`BEAST_VS/FS` in `aurora-glsl.js`: vertical
billboards drawing a procedural side view, or a fox from the front or behind when it heads toward or away from the
camera, foreshortened as it turns; a trotting fox's legs and brush in a gait, a hare's hop, the owl perched or with
its wings spread). White fur at night, lit from above by the curtains and backlit by them (a bright rim where the
silhouette meets the sky), warm by the lanterns and the window, a soft contact shadow on the snow; doubled in the mirror
ice. The glimmers as faint lights lying in the ice (flattened into its plane), seen through the clear ice only (not
under the drifted snow, little where the ice mirrors the sky at a glancing angle), and the light their gatherings give
the ice around them in their curtain's colour (a map drawn each frame from the ecosystem and read by the ice's shader:
dimmed where the site is strained, blooming where it revives, brighter along the cracks). The tracks are the
ecosystem's trail field: a trodden groove in the drifted snow on the ice and on the point's snow, a little darker and
broken into prints, fading over a minute or two as the field decays. Everything the ecosystem draws is scaled by the
view's `fadeIn` (generation crossfades, restoring) and nothing is drawn while restoring. Quality decides only how many
motes follow each glimmer on its own path (1, 1, 0, 0), never the state (tested). Inhabitants are never labelled; the
labels and the status are the same with life on and off (tested). The camera does not follow the life.

**Determinism.** As for every grammar ([LIFE.md](../LIFE.md#contract)): the state at a view time is the same after
continuous play at 15, 30, 60 and 120 frames a second, seeks back and forth, a restored checkpoint and a fresh session,
in ecology 1 and 2, and continuous play through a generation's anchor reaches what a far seek reaches
(`tests/life-aurora-driver.test.js`, on a recorded performance with a failure, its recovery and a verified milestone).
Snapshots give back the same future (also the conditions the grammar keeps on its sites, revival and strain); nothing
grows with time (fixed arrays, at most 64 sites, bounded fields: a five-minute run is tested). The life values and the
music change the state; music 0 is exactly neutral. In the browser: see [Determinism](#determinism).

**Cost.** Simulated tick in Node (continuous play at 30 fps over the whole performance and a minute after it): Lumen
0.77 ms mean (p95 1.06), Self 1.06 ms (p95 1.39), with 112–117 inhabitants and a 160×120 field (1.5 units a cell);
the habitat 0.18 and 0.52 ms a window. A far seek to the end of *lumen-long* (13 days, 12 796 windows; generation 1913,
8 200 ticks) takes 6.5 s in Node, the history pass 79 ms; to 15 % and 60 %: 2.3 and 4.1 s. GPU: within the readings' spread on Lumen and 0.1–0.3 ms on Self at 1920×1080,
quality 0, on the AMD iGPU; two more draw calls (see [Performance](#performance)).

## Labels and privacy

Subsystem labels follow the existing label modes: under each curtain's lower edge, at its middle, its generated name
(or the user's alias) and "role · n rays". The world's words are generic (`describe`, `inspect`, `status`): "A new
curtain kindles", "Tests fail · the curtain turns storm-red over 2 rays", "Recovered · the sky gathers into a corona",
"A ray of Mirael · validated"; never a file name, path, identifier or source (tested in Node, and in the browser by
`qualification/visual/worlds.qual.js`).

## Determinism

No `Math.random`, `Date.now` or `performance.now`: every value is a function of the model, the recipe, the director's
fold and the frame's time. A replay's sky is its recorded history: the host hands the world the recorded windows after a
seek (`onHistory`), and the world rebuilds its own model of the history from them, so a curtain's place (its rank by
birth) and its rays' rise do not depend on where playback was sought from. Everything that places itself relative to
the camera reads the camera's shore position for the frame (a pure function of the view time), never the camera the
previous frame left: a test found and pinned that (the state at a moment is the same whatever was drawn before). The
camera's rig is the host's (it eases over the frames it is given, like every world's). Transient effects are cleared
after a seek; lanterns come back from the director's record. Caches (the prepared model, per-bar music, journeys, the
lanterns) only avoid recomputing pure functions.

`qualification/visual/worlds.qual.js --only determinism,idle --families aurora --size 960x540 --fps 15 --tag aurora` on
SwiftShader, on a temporary copy of the datasets, at the final code of the second pass (the lower edges, the field
lines, the corona, the mountains): **8/8** (`qualification/results/visual/worlds-qualification-aurora.json`): the same
frame on Self in two sessions whatever the second played before (`143474cd34cd158b` both); idle for 90 s after Lumen
Recipes' last event the image keeps changing (mean |Δluma| between samples 30 s apart: 4.13, 3.33, 3.38 of 255) while no
structure, intent, effect or lasting change appears and the director reports idle; no page errors; 50 distinct label
strings over the whole Lumen session (cinematic and stream) with no path, file name, identifier or folder name;
switching between the six worlds 12 times leaves GPU geometries (29) and textures (19) at their level. The first version
passed the same 8/8 (`323361baad6ac03a`), as did a run before the agents' moves began where the wisp is.
`qualification/visual/catalogue.qual.js --families aurora --tag aurora` (SwiftShader, 960×540): **2/2**
(`catalogue-qualification-aurora.json`): with every parameter at its minimum and at its maximum the Lumen recording
renders without page errors, mean luma 43–44 and 72–89 (run on the first version, not again after the second pass). In
Node, `tests/aurora.test.js` (17 tests) pins the layout's purity, the history rebuild, the headless state at a moment
whatever was drawn before, that a wisp never jumps, and that field lines are gentle arcs, barely there at rest and lit
only behind a wisp's journey.

**With digital life** (on its final code, SwiftShader, the generator's own life values):
`qualification/visual/life.qual.js --families aurora --tag aurora`: **19/19** (`life-aurora.json`). On Lumen Recipes at
60 %: the ecosystem's digest and the image are the same after playing near the end and seeking back, after continuous
play from the start (144 s of performance at 6 fps), in a fresh session and after a browser restart (`749b062c`, image
`9867f936b76f6138`); 15, 30, 60 and 120 fps reach the same digest; changing the quality while it lives never changes it
(104 followers drawn at quality 0, none at 3); idle for ten minutes the population lives and moves (114–117 alive) and
the image keeps changing (mean |Δluma| 6.8–8.6 of 255) while no intent appears and the director stays idle, GPU
resources constant (18 geometries, 21 textures), heap 37 MB throughout, checkpoints bounded (6 recent, 24 spread); life
off runs no ecosystem; the labels are the same with life on and off; no page errors. (The script's last three checks,
switching worlds, replay to live and the far seek in the live player, run on the flagship worlds whatever is named:
they passed, and they are not Aurora's.) `qualification/visual/worlds.qual.js --only determinism,idle --families aurora
--size 960x540 --fps 15 --tag aurora-life` on a temporary copy of the datasets: **8/8**
(`worlds-qualification-aurora-life.json`): the same frame on Self in two sessions whatever the second played before
(`3ca354d921df7f9e` both; the frame now includes the life); idle for 90 s after Lumen's last event the image keeps changing
(4.39, 3.45, 3.66 of 255) with no new structure, intent, effect or lasting change and the director idle; no page
errors; 50 distinct label strings over the whole session with no path, file name, identifier or folder name; switching
between the six worlds 12 times leaves GPU geometries (29) and textures (19) at their level.

## Performance

GPU time per frame (the host's timer: background, the reflection pass, scene, post, bloom, grade), AMD Radeon iGPU
through WSL2 D3D12, 1920×1080, the film path at a fixed quality: six readings (each after 20 more frames at the same
moment) after 3 s of warm-up, at 60 % of Lumen Recipes, 50 % of Self and the end of Excalidraw. Means, with the range of
the six readings. The second pass was measured against the first version in the same session (the first version's
files checked out, then this code), the machine otherwise quiet (load average 2–4):

| Project | | Quality 0 | Quality 1 | Quality 2 | Quality 3 |
|---|---|---|---|---|---|
| Lumen (17 files, 6 curtains) | first version | 13.80 ms (13.42–14.67) | 10.41 | 6.26 | 3.80 |
| | second pass | 13.83, 13.87 (13.43–14.65) | 10.53, 10.47 | 6.44, 6.38 | 3.73, 3.74 |
| Self (92 files, 9 curtains at 50 %) | first version | 14.78 (14.62–15.28) | 11.03 | 6.85 | 3.98 |
| | second pass | 14.59, 14.60 (14.37–15.05) | 11.13, 11.13 | 6.82, 6.69 | 3.89, 3.96 |
| Excalidraw (450 files, 9 curtains) | first version | 15.01 (14.80–15.21) | 11.39 | 7.07 | 4.10 |
| | second pass | 14.76, 14.86 (14.53–15.15) | 11.47, 11.43 | 7.10, 6.95 | 4.19, 4.20 |

**With digital life** (the same timer, the same method, after Aurora was inhabited; life off and on alternately on the
same moment, two rounds each, a fresh page each run, the machine otherwise quiet, load average about 1):

| Project, moment | Life off | Life on |
|---|---|---|
| Lumen at 60 % | 13.95, 13.72 ms | 13.84, 13.85 ms |
| Lumen at its end | 13.99, 14.05 | 14.10, 14.04 |
| Self at 50 % | 14.67, 14.62 | 14.79, 14.74 |
| Self at its end | 14.95, 14.93 | 15.17, 15.22 |

On Lumen the difference is inside the readings' spread; on Self life costs 0.1–0.3 ms. Draw calls: two more in the scene
(the animals and the glimmers; the animals are drawn again in the reflection pass), 11 against 9 on Lumen. The world's
update at a held moment (no tick: presentation only) 0.49–0.68 ms against 0.43–0.58; each simulated tick costs 0.8–1.1
ms more on the CPU (Node, see [Digital life](#digital-life)), 20 a second.

The second pass's two runs bracket its last two changes (fuller rays, a brighter ignition). At quality 0 it is 0.15–0.4
ms cheaper on Self and Excalidraw and within 0.1 ms on Lumen, inside the spread of the readings; at qualities 1–3 the
differences are within ±0.2 ms. CPU (`updateMs`): 0.4–0.5 ms on Lumen and Self, 0.8 on Excalidraw. Draw calls: 9 in
the scene (8 when no field line or ribbon is drawn).

How it got there, profiling by elimination (hiding parts of the world in the film page; Lumen Recipes at 60 % and Self
at its end, quality 0, during development, with a debugging handle since removed): with every object hidden, the host's
pipeline and the half-resolution sky alone take about 8.5–9 ms on this GPU at quality 0 (6.5 at quality 1, which drops
MSAA). The first version measured 20.9 ms on Lumen. The curtains cost 4.4 ms with up to 512 columns a curtain; with a
trivial fragment shader they still cost 3.6, so the cost was not shading but the thin triangles where folds turn edge-on
and the 4× MSAA blending (at quality 1 the same curtains cost 2.7): 1,920 columns shared out among the curtains (48–224
each) and 10 rows (the vertical light is per fragment) brought them to about 3 ms. The reflection pass costs about 1.5
ms (a third of the resolution, drawn only below the horizon, without stars or field lines); the ice about 1 ms; the
mountains and the land about 0.6 (a `discard` for the reflection had disabled early depth rejection there: vertex
clamping replaced it); stars, wisps and ribbons about 0.3–0.5.

| Quality | What changes |
|---|---|
| 0 | MSAA 4× (host), 1,920 curtain columns, 10 rows, the reflection at a third of the resolution with five glossy taps, 2,800 stars |
| 1 | No MSAA (host), 1,664 columns, 9 rows, 2,400 stars |
| 2 | 75 % resolution (host), 1,408 columns, 8 rows, the reflection at a quarter, 2,000 stars |
| 3 | 55 % resolution (host), 1,152 columns, 6 rows, the reflection at a fifth with one tap, no Milky Way, 1,400 stars |

Films always render at quality 0.

## Selection and compatibility

- `engine/recipe.js`: `PREVIEWS` is `['aurora']`; `RECIPE_VERSION` stays 5. A preview is never scored and never drawn
  (the family scores and their random draws are `FAMILIES`' alone), its genome and palette come from their own streams
  (`rng('genome', 'aurora', …)`, `rng('palette', 'aurora', …)`): every identity of every generator is unchanged
  (`tests/aurora.test.js` repeats the fingerprints of `tests/recipe.test.js` and `tests/generator-v5.test.js`; both
  suites pass unchanged except their statement that no preview is left, which now names Aurora). A chosen Aurora is a
  user identity (locked, founded), with the cinematic finish and the composed score. A new one now also has digital
  life, drawn from its own random stream (see [Digital life](#digital-life)); one chosen in 0.9.0 keeps none.
- The genome from the project's traits at generation: symbols per file make the curtains taller, coupling folds them
  deeper, the agents' share of the work makes the rays shimmer more, many subsystems favour the wide view, the project's
  size sets the rays' spacing.
- `engine/catalog.js` `PREVIEWS`: its parameters (`aurora.*`, `sky.*`, `lake.*`, `land.*`, `motion.*`, `camera.*`,
  `agents.*`) and the common ones. No pack may take it as its base yet (its parameters may still change). `/api/catalog`
  lists it under `previews`.
- `public/worlds/host.js` `BUILTIN` loads it and hands it a replay's history; the Visual Studio offers it after the six
  with an *In design* pill and a thumbnail rendered from the project (the Artist Studio does not compose over a preview
  yet); the web demo offers it with the other worlds (nine in all, with the Construct and Monolith).
- Qualification: `qualification/visual/worlds.qual.js` and `catalogue.qual.js` take it when named (the catalogue chooses
  it and tunes every parameter to each end, since no pack may take it as a base).

## What is not done

- **Watched by the owner on films** (2026-11-01): the world on the whole Lumen Recipes session (landscape and 9:16) and
  Self's end with a minute of quiet, accepted ("aurora looks good"), with chromatic aberration then made the default at
  the owner's request; and the digital life on films of the same sessions, accepted ("looks great"). The motion was
  otherwise checked in Node tests and by the idle qualification's frame differences.
- **The animals are small at the default framing.** A fox out on the ice is about 15–60 pixels long at 1920×1080 (they keep
  at least 14 units from the camera and roam within about 60); hares by the cabin's spruces, 120–170 units away, are a
  few pixels, and the owl perched on a spruce's top is a white speck. In a portrait frame the foxes are smaller still.
  The silhouettes are procedural (signed distances in a billboard); they were not seen close up.
- **The recovery's owl is seen mostly after the corona in a landscape frame**: the corona (and in Lumen the earned
  breakup with it) turns the camera up for 11–16 s, so the owl's flight out over the ice and the bloom under the ice are
  seen as the camera comes down; a portrait frame keeps the ice in view and shows the owl under the corona. The owl
  never perches on a lantern: the lanterns come from the director's record, which the ecosystem does not read.
- **Shelter is a direction, not always an arrival**: a fox out on the ice needs 30–50 s to reach the cabin's lee, so in
  a short failure (Lumen's lasts 20 s) the foxes are seen trotting toward the cabin and the spruces, then sitting up to
  look at the sky when it clears. The cabin's side of the point is partly out of a portrait frame.
- **Tracks** are the ecosystem's trail field at 1.5 units a cell: a trodden band in the drifted snow and the point's
  snow, darker and broken into prints by a noise, not individual paw prints; they show only where there is snow (an
  identity with little drifted snow shows little), and no still was examined closely for them.
- **The glimmers' gatherings** stand under each curtain's bearing on the near ice; with many curtains across the sky
  they read as a scatter of faint lights across the lake more than as distinct gatherings at the default framing.
- **Not run for the life**: `catalogue.qual.js` (every `life.*` value at its extremes), the Visual Studio browser suite
  with Aurora's new Essentials, a live session, Auto quality stepping down with life on, and the NVIDIA adapter, OBS or
  SwiftShader at 1920×1080.
- **Stacked lower edges.** The false ridges are gone (see [The lower edges](#the-lower-edges)), but where curtains stack
  (Self, Excalidraw, Lumen's last minutes) the plain sky under one curtain's bright lower edge, above the next curtain's
  light or the airglow, is still a darker strip whose top follows that edge. It now reads as sky (stars in it, rays of
  the farther curtains crossing it), not as mountains, at full size; at thumbnail size it can still read as a band.
- **Less light overall.** With the light in the rays instead of a lit body, the curtains give 0.6–1.1 times their
  earlier mean light in the sky (Excalidraw 0.64, Lumen 0.84, Self 1.08; the brightest 1 % 0.87–1.25 times), and the
  ice's reflection 0.56–0.67 times: the reflected rays, drawn at a third of the resolution, blur together less brightly
  than the old lit body did. Nobody else has judged whether the curtains now look too sparse or combed.
- **The corona** has no crown any more; its rays are discrete spokes with a little glow between them, which may read as
  too sparse beside a real corona's diffuse glow. In a landscape frame the camera looks so far up that the horizon
  leaves the frame for a few seconds (a portrait keeps both). In Lumen Recipes the earned breakup coincides with the
  recovery's corona; a breakup on its own was not seen.
- **Field-line journeys** never happen in the recorded datasets (a scan of Lumen Recipes at 4 frames a second found
  none); they and their wakes were seen in the tests and in one constructed scene (above). So in the recorded projects
  the field lines show only while one draws itself in and behind a file's pulse; at rest they are effectively invisible.
  Field lines are drawn between curtains only; dependencies inside a subsystem are not drawn.
- **Music** was pinned against a stub clock in Node; it was not seen or heard with the real score in a film.
- **Performance**: at quality 0 Self and Excalidraw measure about 15 ms on the AMD iGPU, under 16 ms and in the other
  worlds' range, but not far under it; the host's pipeline (MSAA, bloom, grade) and the half-resolution sky are about 9
  ms of that on this GPU. Only the AMD iGPU was measured; Auto was not seen stepping down; nothing was rendered on the
  NVIDIA adapter, in OBS, or on SwiftShader at 1920×1080; no soak.
- **Not run**: the Visual Studio and web demo browser suites (`qualification/ui/workspaces/visual.qual.js`,
  `qualification/site/web-demo.qual.js`) and `qualification/ui/preview-shots.js` were updated for the preview but not
  run; nor a live session, the Explorer selection's pull on the view, or the stream label mode by eye.
- **A tuned palette is held to an aurora**: the curtains' hues are clamped to 116–168° (foot) and 262–334° (fringe)
  whatever colour `palette.primary` or `palette.secondary` is tuned to, and the night's `deep` and `haze` are kept dark.
- **The land is simple**: procedural mountain layers (a few massifs and bare rock on the steepest faces since the
  second pass; the farther layers are still pale low bands, and their gullies can look regular at full size), one cabin
  and a few spruces on the point; the near bank is mostly out of view (the camera stands at the water's edge for the
  reflection). The reflection is drawn at a third of the resolution and blurred along the vertical: reflected rays are
  soft. Stars and field lines are not reflected (they are faint there, and the pass is cheaper without them).
- **Portraits** have a band of starry sky above the curtains, and the ice nearest the camera (which reflects the empty
  sky overhead) is dark.
- At most 48 curtains are drawn (49 subsystems in the test project: the 49th is left out).
- `aurora-layout.js` reuses Temporal Terrain's `prepare` and `historyFrom` (`terrain-layout.js`): a change there changes
  both worlds.


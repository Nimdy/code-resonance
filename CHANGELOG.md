# Changelog

## Unreleased

- **CI in about half the time:** the unit and integration suite ran as one job per platform and took 9–10 minutes on
  a two-core runner, most of it a few long digital-life simulations. It now runs as three parallel shards per platform
  (`node --test --test-shard=i/3`, every third test file: 199, 237 and 230 tests, 118–127 s each at two workers
  locally), with the syntax check, the package and the smoke test once, in shard 1. Every test still runs on every
  pull request. Measured on its own pull request: the validation jobs took 4.1 minutes (about 10 before) and the
  whole check 6.9 minutes (10–13 before), now set by the Ember Observatory pack's compatibility test.
- **Timing:** the two failures 0.9.0's pull request met (the audio export's first bar a hair below zero, and a test
  that expected the life driver's background stage in one frame) were fixed there. A search for more found none: the
  suite passed 666/666 in eight stressed runs (three suites at once on 24 cores, twice, and confined to two cores each
  with a busy loop competing, twice).

## 0.9.0 — 2026-11-01

Product 0.9.0, for use on your own machine; not stable. This tag is `v0.9.0`. **Aurora**, a new world, as a preview
you choose yourself: a polar night over a frozen lake, with the project as the aurora. The three worlds graduated in
0.8.1 are finished: agents travel each world's own paths, the music reaches Fractal Continuum and Temporal Terrain,
Temporal Terrain flies over its history when idle, and Synaptic Storm's subagents are tethered to their parent.
Interpretation **11** (10 in 0.8.1: a subagent names its parent): on its first start the receiver rebuilds each
project's derived files once from its journal. No existing identity changes; generator 5 is unchanged and never
chooses Aurora. Visual Pack SDK **1.3**. The VS Code extension is 0.9.0 (`code-resonance-0.9.0.vsix`); it is not
published to the Marketplace or Open VSX yet ([docs/PUBLISHING.md](docs/PUBLISHING.md)).

- **Fixed: exporting a recording's audio could fail** with *Failed to execute 'setValueAtTime'*: the offline render
  computed the first bar's offset from epoch timestamps (about 1.8e12 ms, where a double resolves 2^-12 ms), so for
  some start times it rounded to a hair below zero (-2.4e-7 s), which the browser refuses. It now never starts before
  zero. Seen once in CI (`browser/stage.qual.js`, the WAV export), not reproduced on demand.
- **Aurora, a new world (preview):** a polar night over a frozen lake, and the software is the aurora. Subsystems are
  curtains of light across the sky (folded sheets hanging along the magnetic field, a sharp bright lower edge, rays with dark
  sky between them, green to teal at their foot and violet to magenta toward their tops, seen through a lens whose
  chromatic aberration is on by default), each in its own hue, layered in depth by order of
  birth and as long as their files; files are the rays inside them, as tall as their symbols, igniting when born;
  dependencies are long, gentle field lines, barely there at rest and lit behind a wisp
  travelling along them. Agents are wisps that hover over the ice while waiting and fly up to ignite the ray
  they edit; subagents are tethered to their parent. Passing tests pulse along a curtain, a failure turns it storm-red
  while its files are stressed, a recovery gathers the sky into a corona overhead, a commit is a meteor, a verified
  milestone leaves a lantern on the shore and can earn a rare auroral breakup; the curtains ripple, shimmer and surge with
  the music. The mirror ice doubles it all, which makes vertical clips a tall sky over its reflection. A preview: chosen
  only in the Visual Studio (marked In design), the render lab or the web demo, never automatically; no existing identity
  changes. Built and judged from stills; design and what is not done in [docs/worlds/aurora.md](docs/worlds/aurora.md).
- **Temporal Terrain flies over its history when the performance is idle:** once nothing has happened for 24 s and the
  director's activity is idle, the camera travels back along the time axis over the older land that the logarithmic
  depth compresses into the haze, to where the land's recorded history began, lingers there and returns (72 s in all;
  later flights every 120 s while the quiet lasts). Any happening ends it at once, an agent at work holds it, and it
  flies only where the history reaches well beyond the camera's own view (Self 60 s after its last event, Lumen
  Recipes after six minutes, never a project indexed whole by its first scan). Portrait keeps its steep view; the
  haze counts from where the camera is, so the old land is clear around it. A pure function of the performance and
  the moment, like the rest of the world.
- **Roads in the land:** Temporal Terrain's dependencies between subsystems are paths of light in the land near the
  front edge instead of arcs over it: from the importing peak down into the valley beside its range, across at a depth
  of its own (a longer road behind the shorter ones it spans) and up to the imported peak, drawn by the land's own
  shader. An agent moving between ranges the roads join travels along them; two agents on one file are two signals in
  their colours meeting at its peak. The recorded datasets never move an agent along a road, so this was seen only in
  tests and a constructed scene.
- **Temporal Terrain hears the music:** with the host's musical clock, the present's contour lines shimmer on the
  off-beat eighths the arrangement plays, and a new section sends a soft wave of light back over the land. Tests:
  `tests/terrain-flight.test.js`, `tests/terrain-roads.test.js`, `tests/terrain-music.test.js`; design and what is not
  done in [docs/worlds/temporal-terrain.md](docs/worlds/temporal-terrain.md).
- **Fractal Continuum's agents travel the threads:** a dependency thread is now a vein of light along the surface
  (traced at a coarse recursion and draped over the relief, its ends on the sites; within a region it hugs the form,
  between regions it arcs gently over it) instead of an arc that could run through the form. Between two sites the
  threads join (at most four), an agent's signal runs down to the first site and along those veins at conduction
  speed (1.8 to 3.2 s, a comet of its colour behind it); elsewhere it keeps its ride. A move now begins where the
  signal is, so a change that interrupts one (a tool reported for 40 ms, the edit's cue a moment later) no longer
  makes it jump: on Lumen Recipes, steps of more than 5 world units in one frame went from 24 to 2. Two agents on one
  file (`agent.collision`) are two signals in their colours swooping down to its site, with rings of both colours
  rippling across the surface. With the host's musical clock, sites also pulse on the eighth notes between the beats
  where the arrangement plays rhythm (read at their own bar: a pulse in flight never changes), and a section's onset
  is a soft volley of every site and a brief shimmer of glints over the surface. Tested in Node
  (`tests/fractal-agents.test.js`, `tests/fractal-music.test.js`; `docs/worlds/fractal-continuum.md`); not yet seen
  by the owner.
- **Synaptic Storm: subagents tethered to their parent.** A subagent is a smaller signal (0.6 of a session's), and a
  faint filament in its colour ties it to its parent's signal: along the axon pathway between their neurons when the
  graph joins them, otherwise a shallow arc, easing between the two while either travels, with a bead of light running
  down it from the parent every five seconds. No tether when the parent is unknown or has ended; no words, so labels,
  the OBS view and recordings show nothing new. The parent comes from **interpretation 11**: every adapter that observes
  subagents (Claude Code, Codex, Qwen, Copilot, Cursor, Droid) keys one as its session's key plus its own, in the
  parent's session, so once the receiver has observed that session a subagent's `agent.state` intents carry
  `subject.parentAgentId` (the parent's public id, never a name or path; packs receive it as an opaque token). On its
  first start the receiver rebuilds each project's derived files once from its journal; nothing else changes. Seen only
  on a synthetic fixture (no recording has subagents), not reviewed. Tests: `tests/agent-parents.test.js`,
  `tests/synaptic-subagents.test.js` ([docs/worlds/synaptic-storm.md](docs/worlds/synaptic-storm.md#agents),
  [docs/AGENTS.md](docs/AGENTS.md#known-limits)).
- **Visual Pack SDK 1.3:** Synaptic Storm, Fractal Continuum and Temporal Terrain as the base of a declarative or shader
  pack and the project trait `grown` (in the pack schema's traits now) for a world pack's parameters, both available
  since 0.8.1, are SDK 1.3: a pack that uses them declares `"sdk": "^1.3"`, so that an older receiver says *needs SDK 1.3
  or later* instead of refusing an unknown family or trait. One that declares less still installs, with a warning that
  says what to declare (`node scripts/pack.js validate`, the Visual Packs import). The Artist Studio's *Export* writes
  `^1.3` over the three and `^1.2` otherwise, so a creation over a flagship still installs on 0.8.0. Every pack written
  for `^1.0` to `^1.2` runs unchanged; `sdk.version` is `'1.3.0'`, and a world pack's agent presences carry a subagent's
  `parent` ([docs/packs/migration.md](docs/packs/migration.md)).

## 0.8.1 — 2026-10-31

Product 0.8.1, for use on your own machine; not stable. This tag is `v0.8.1`. Visual Recipe generator **5**: Synaptic
Storm, Fractal Continuum and Temporal Terrain graduate from preview, the automatic choice can pick them for a new
identity, and each is inhabited by digital life of its own. No existing identity changes. The owner watched each on a
film of the whole Lumen Recipes session (2×, life on, 1920×1080 on the AMD iGPU) and accepted them; their six curated
looks have not been reviewed. Interpretation is still 10. The VS Code extension is 0.8.1
(`code-resonance-0.8.1.vsix`); it is not published to the Marketplace or Open VSX yet
([docs/PUBLISHING.md](docs/PUBLISHING.md)).

- **Six worlds to choose from: generator 5.** Synaptic Storm, Fractal Continuum and Temporal Terrain graduate: the
  family scores can choose them for a new identity, each scored from its own random stream after the flagships'
  unchanged draws. Synaptic Storm wants dense, coupled wiring and the agents' share of the work, Fractal Continuum
  intricate, function-heavy code in a few subsystems, Temporal Terrain a project that grew while it was observed (a
  new trait, `grown`: the share of its symbols created since its first scan). Their new identities get digital life
  (its own stream; each world's ecosystem below). No existing identity changes: generator 4's families, order, draws
  and values are as pinned (`tests/recipe.test.js`; `tests/generator-v5.test.js` checks v3 and v4 bit for bit against
  the generator before it), an identity stored by generator 4 is redrawn with 4 and never moves by itself, and
  choosing a family, regenerating or going back to automatic is a new identity, as before. Over a synthetic corpus of
  2,000 projects generator 5 chooses Stellar Forge 29.3 %, Synaptic Storm 15.8 %, Fractal Biosphere 15.6 %, Fractal
  Continuum 13.9 %, Machine Cathedral 13.3 %, Temporal Terrain 12.2 % (generator 4: Stellar Forge 53.4 %); Excalidraw
  becomes a Synaptic Storm, Lumen Recipes and Code Resonance itself Temporal Terrains
  ([docs/WORLDS.md](docs/WORLDS.md#from-data-to-identity)). The web demo keeps opening on Stellar Forge
  (`scripts/build-site.js` chooses it for the recording, as an author would; the genome is the one it has served since
  0.8.0) and offers the other five a click away.
- **Graduation:** the three are families of the catalogue (their parameters frozen, a base for declarative and shader
  looks; the pack schema's shader `base` lists them), `/api/catalog` lists six families and no preview, and the Visual
  Studio shows them as worlds of their own: no *In design* pill, two curated looks each (*Storm front*, *Glass
  cortex*; *Teal Mandelbulb*, *Kaleidoscope crystal*; *Survey map*, *Misty valley*) and an Essentials group. The
  Artist Studio composes over them (a composition may take one as its base). The new curated looks have not been
  reviewed artistically.
- **Synaptic Storm can be inhabited:** behind `life.enabled`, as in the flagship worlds, the network is inhabited by
  astrocytes that settle in domains beside the neurons' synapses, vesicles that ride a slow neuromodulator tide and
  gather in swirls at active synapses, and microglia that survey an inhibited neuron's edge
  (`public/worlds/life/synaptic.js`). A failing run inhibits the neurons of the files it covers and life withdraws
  from them; after the recovery it returns. A calcium wave crosses the glia when their neuron fires (always gold,
  never an agent's colour), and a neuron's membrane and synaptic clefts brighten with the life gathered there. Only as
  many inhabitants are awake as the neurons can host. On for new identities (generator 5); the catalogue's entry
  offers the standard `life.*` group and its Essentials the switch. A recipe without life renders exactly as before
  (pinned against 1226b8a). Tests: `tests/life-synaptic*.test.js`.
- **Fractal Continuum can be inhabited:** motes of light living on the fractal's surface drift with its current,
  gather at the sites being worked on and leave threads of light between them; small flocks skim the relief and embers
  rest in its hollows. A failing run opens a void over its region and the motes wait at its edge; after the recovery
  they come back. The ecosystem lives on a map of the sphere of directions (azimuthal equidistant around the form's
  pole, the life held within 135° of it), the world draws each inhabitant on the surface as drawn at that moment,
  hidden behind the relief, and the life's light pools in the relief around its gatherings. Behind the recipe's `life`
  values, on for new identities (generator 5); the catalogue offers the life group and its Essentials the switch, and
  with life off the world renders exactly as before. Measured on the AMD iGPU at 1920×1080: about 1.2 ms of GPU time a
  frame at quality 0 (two draw calls), about 1.1–1.5 ms of CPU a simulated tick. Grammar
  `public/worlds/life/fractal.js`; tests `tests/life-fractal*.test.js`; design and measurements in
  [docs/worlds/fractal-continuum.md](docs/worlds/fractal-continuum.md#digital-life).
- **Temporal Terrain can be inhabited:** digital life (`public/worlds/life/terrain.js`), on when the recipe's life
  values say so: on for new identities (generator 5); the catalogue offers the flagships' `life.*` group and its
  Essentials the switch, and off the world is exactly as it was. Grazers graze the pastures of the present (each
  file's ridge behind the front edge) against the flow of time, travel in the valleys, lie down and are carried back
  by the land when tired, and drift into the haze when old; a fault scatters them to shelter in other ranges until it
  heals. Swifts flock over the present; gleaners follow the herds' paths as they recede through the older land. The
  land's rate is the macro current, and the trail, energy and disturbance fields ride the land back. The world draws
  them on the drawn ground, with their light on the contour lines around them and their paths through the lines.
  Determinism, behaviour and the world's life-off guarantee are tested (`tests/life-terrain*.test.js`;
  `docs/worlds/temporal-terrain.md`).
- **Synaptic Storm's agents travel the network:** between two neurons the axon graph joins, an agent's signal runs in
  from its branch to the soma and along those axons' own curves at conduction speed (1.8 to 4.5 s) instead of a lifted
  arc; two agents on one file (`agent.collision`) are two signals in their colours meeting at its branch in a ring.
  With the host's musical clock (now offered to worlds as `ctx.musicAt`, as the artist layers had it), its neurons
  also fire on the eighth notes between the beats where the arrangement plays rhythm (read at their own bar: a pulse
  in flight never changes), and a section's onset is a soft synchronous volley.
- **Temporal Terrain's touch:** an agent's edit opens two rings that last about two seconds and cross the contour
  lines (they read faint next to its pool of light).
- **Fractal Continuum: the same frame whatever was played before a seek:** after a seek the world read the camera left
  from the previous moment (for its level of detail and for a close-up's dolly) before the camera rig snapped to the
  new moment, so two sessions seeking to the same moment could render different frames (`visual/worlds.qual.js`
  determinism on Lumen at 160 s; also at 1226b8a). Until the rig has placed the camera for the new moment, the world
  now takes the framing distance and the direction its goal turns to; continuous play is unchanged. The check passes
  on SwiftShader with digital life off and on; `tests/fractal-seek.test.js` (new) fails without the fix. Details in
  [docs/worlds/fractal-continuum.md](docs/worlds/fractal-continuum.md#determinism).
- **Qualification parity:** `catalogue.qual.js` renders all six families with every parameter at both ends (12/12,
  SwiftShader); `worlds.qual.js` qualifies determinism across seeks, idle life, label privacy and resource release for
  every family (`--families`, `--size`, `--fps`, `--tag`). Run for the three graduated worlds: 21/22. The one failure,
  Fractal Continuum's determinism across seeks (older than generator 5), is fixed above; on the integrated branch the
  three, with digital life on, pass 22/22 (SwiftShader)
  ([QUALIFICATION.md](docs/QUALIFICATION.md#graduation-generator-5-and-qualification-parity)).
- **Long frames at 1920×1080 diagnosed** (`qualification/visual/stalls.js`, new: per-frame callback, WebGL and GPU
  timer records plus a Chrome trace of every process): on the WSL2 AMD path (ANGLE's GL backend over Mesa d3d12) the
  GPU process blocks in `GLContextEGL::MakeCurrent` about 47 times a second at 1080p (median 12 ms, under 8 ms at
  720p), waiting for the GPU to finish its queued work; when GPU frames lengthen (heavier moments, another process on
  the same GPU) the waits reach 40–53 ms and frames are missed in runs of 100–133 ms. Not the page's work and not the
  label overlay, and not removed by drawing less (an empty scene showed it too), so nothing in the world changed for
  it; native Windows Chrome (ANGLE on Direct3D 11) does not take this path and was not measured. Details in
  `docs/worlds/synaptic-storm.md`.
- **Where your data goes:** a picture at the top of the README's *Local-first and private* and of SECURITY.md
  (`docs/media/data-flow.svg`): the extension and the agent hooks send only to the receiver on `127.0.0.1`, the
  receiver keeps its data in its folder and serves the browser, recordings go to your disk, and nothing goes to the
  internet. The README's *At a glance* points at it, and SECURITY.md says it in words too. The data folder's label
  says "receiver data stored here" and points to SECURITY.md for erasing: deleting the folder does not erase the
  extension's outbox, a browser's storage or the recordings, films and exports you saved (a review caught "delete it
  to erase all"). SECURITY.md's *Erasing data* now names those last ones too.
- **The release download:** the README names the VSIX on the latest release and how to check it: its SHA-256 in
  `SHA256SUMS.txt`, or a build of the release's tag, which with the same Node version is the same file byte for byte
  (the packager writes fixed timestamps; 0.8.0 checked in two checkouts and against the download).

## 0.8.0 — 2026-10-31

Product 0.8.0, for use on your own machine; not stable. This tag is `v0.8.0`. Interpretation **10** (9 in 0.7.2: the
language adapters and the larger agent catalog): on its first start the receiver rebuilds each project's derived files
once from its journal. No existing identity changes: recipe traits still count only the v9 language categories, and
every JS/TS file keeps its v9 structure and test flag. The VS Code extension is 0.8.0 (`code-resonance-0.8.0.vsix`) and
carries the receiver: installed alone, it starts one when none answers. The web demo is live at
<https://nimdy.github.io/code-resonance/>. Temporal Terrain joins Synaptic Storm and Fractal Continuum as a preview,
chosen only explicitly. The extension is not published to the Marketplace or Open VSX yet
([docs/PUBLISHING.md](docs/PUBLISHING.md)).

- **Record to a file on disk:** Record & Broadcast offers *Record to a file on disk* (recommended for long sessions)
  beside *Keep in memory, download when stopped* (the default, unchanged), a choice kept by this browser. Record opens
  the browser's Save dialog; a worker (`public/recording-worker.js`) then writes each chunk the recorder delivers, in
  place, to a working file in the browser's private file storage through a synchronous access handle, so memory stays
  flat, the length is bounded by disk and a crash or a closed tab keeps everything written (a writable stream on the
  chosen file writes to a temporary copy that Chromium deletes when the page crashes: measured). When it stops, the
  working file is copied into the chosen file and made seekable on the way (`public/webm.js`: the Segment's and every
  Cluster's size, a SeekHead, the duration, Cues), then deleted. An interrupted recording is offered by any window
  opened afterwards (**Save to a file…** or **Discard**); each working file is held by its own Web Lock while a window
  writes or saves it. The recorder shows the bytes on disk and the file; a browser without the File System Access API,
  or a page on a network address, says why the choice is unavailable. No receiver write path (two more static files
  are served). Measured in headless Chromium for three minutes (`qualification/results/memory/memory-record-disk.json`):
  kept in memory, the browser process grew with the file one for one (+46 MB for a 46 MB file at 720p, +37 MB for 35 MB
  at 1080 × 1920); written to disk, +0 and +3 MB, the working file on disk growing with every chunk; saved in 0.4-0.5 s
  as seekable files of 181 s. A renderer crashed at 61.9 s left all 16.6 MB written, saved as a seekable 60.9 s file; a
  1 GB recording was indexed and saved in 5.1 s. Checked by `tests/webm.test.js`, `tests/record-to-disk.test.js`, the Output interface suite and
  `qualification/visual/record-disk.qual.js`; not verified with the real Save dialog on Windows or for hours.
- **Recorder:** a recording whose recorder stops by itself (a recorder error, or a chunk that cannot be written to
  disk) is saved too, once, however many finishes ask for it; before, a recorder error dropped the file. Record &
  Broadcast draws Record's state again once a press is answered (the busy state enabled it even if another window had
  started recording meanwhile).
- **Output interface suite:** the two-window Record race and the crash take-over wait on what the windows show (both
  idle with the recorder lock free before a round; both presses answered before judging it; each window's own log of
  when it recorded), stop a late recording before the next round, and press again a round whose presses were not
  simultaneous. The failures under load were the test's: a fixed two-second watch, while a first Record on a software
  renderer can take longer (3.3 and 7.2 s for a first round with `npm test` running alongside), and a press whose timer
  fires late in a busy window finds its button already disabled (4.8 s late in a loaded run of the previous checks,
  which failed 51/53 while every round had exactly one recording); the lock never let two windows record. The control
  (lock bypassed) now measures what it was meant to: two windows recording at once (it read 0 before, its watch ending
  before either had started). The new checks passed 62/62 unloaded and in three loaded runs.
- **Soak:** the first local three-hour soak completed, 7/11 (`qualification/results/soak/soak-3h-amd-playwright.json`).
  Events, sound, packs, GPU objects, the receiver restart and page errors passed. The page heap, the renderer process,
  the Construct's frame rate and two recording starts (one 0.4 s interval each) failed. The soak's project
  grows all along, and experiments with fresh browsers at its sizes traced most of that to the project's size: the
  Construct about 15 draw calls per file, and staying loaded once shown. The renderer's growth was Playwright's DevTools
  connection (docs/QUALIFICATION.md, *Three-hour soak*). `visual/soak.qual.js` now uses the lean driver and waits for
  the project's first view. It records the heap after a collection at the end of every world's turn and the
  Construct's own counts. It ends with a control, every world again in a fresh browser on the same project; the memory
  and frame-rate checks are held to that control. A rerun with it passed 10/11: memory and frame rates within the
  control after three hours. Its one failure is the recording start again. From the second hour on, the soak's
  "Stellar Forge" had been Ember Observatory (a look stays when its own family is chosen again): the held starts were
  the soaks' four recordings of Ember Observatory, every one of them. 20 focused takes, Ember Observatory included,
  have not reproduced it.
  The harness now removes the look for Stellar Forge and records Ember Observatory in its own segment.

- **Web demo:** a no-install page on GitHub Pages (<https://nimdy.github.io/code-resonance/>) that opens on the
  Performance Stage replaying the public recording *Lumen Recipes* in the real player, with its music after a click,
  in any of the six world families, the Construct or Monolith, at 1×, 4× or 16×; it also plays on a phone.
  `npm run site` (`scripts/build-site.js`, Node only) starts a receiver in-process on a temporary
  copy of the recording (a free loopback port), exports every read-only answer the Stage needs for a replay to
  `site/api/` with a manifest, and copies the player beside them; the same recording builds the same files byte for
  byte (3.5 MB). The static mode (`public/web-demo/`, included only in the site's page) answers `/api/*` from those
  files, keeps every `POST` inert, stubs the change feed and leaves out what needs a receiver (Control Center, live
  mode, pairing, saving). `.github/workflows/pages.yml` builds and deploys it on pushes to `main` and by hand, never on
  pull requests; the owner sets *Settings › Pages › Source: GitHub Actions* once. Checked by `tests/web-demo.test.js`
  and, in a real browser, `qualification/site/web-demo.qual.js`. [docs/WEB-DEMO.md](docs/WEB-DEMO.md).
- **Temporal Terrain (preview):** a sixth built-in world family, chosen only explicitly (Visual Studio, marked *In
  design*; the render lab's `--family temporal-terrain`; the web demo), never by the family scores: `RECIPE_VERSION`
  stays 4 and every existing identity is unchanged. The project's history as a contour landscape: the present is the
  lit front edge, the past recedes toward the horizon on a logarithmic scale; subsystems are ranges in their own hues
  (placed from the middle outward in order of birth), files ridges running back from their birth, their height from
  their symbols, with luminous anti-aliased contour lines over a dark relief. Agents survey as lights in their CAST
  colour and shape and raise the ground where they edit; tests sweep a scan; a failure opens a fault that stays as a
  scar for exactly as long as the files were stressed; recovery heals it; commits leave survey lines and stakes;
  verified milestones leave beacons and, with the director's token and a four-minute gap, earn a sunrise.
  `public/worlds/terrain-layout.js` keeps the land as rows of fixed moments (a pyramid of levels, each row computed once
  while it stays in its level), `terrain-glsl.js` draws it. The host gives a built-in world that asks for them a
  replay's recorded windows (`onHistory`), so the land behind a seek is the whole recorded history, as when played from
  the start. `tests/terrain.test.js`; design, stills and GPU time in
  [docs/worlds/temporal-terrain.md](docs/worlds/temporal-terrain.md).
- **Relative URLs in the player:** its dynamic module imports (`public/app.js`, the Visual, Artist and Packs
  workspaces) and the workspaces' stylesheets (`public/ui/dom.js`) are relative, so the page works under any path. The
  receiver serves the same files at the same URLs as before.
- **The extension alone is enough.** The VSIX now carries the receiver (receiver, engine, player, Control Center,
  vendored three.js and TypeScript, hook adapters: about 2.9 MB, 170 files). When capture starts or the Stage opens and
  no receiver answers on `resonance.receiverPort`, the extension starts it: a separate, detached process bound to
  `127.0.0.1`, run with VS Code's own runtime (VS Code's Electron with `ELECTRON_RUN_AS_NODE=1` on the desktop, the VS
  Code Server's `node` in WSL/SSH windows), logging to `logs/receiver.log` in the data directory. Every window reuses
  it through the token proof, and two windows starting at once start one (a lock file). A receiver that already
  answers (`npm start` or `npm run up` in a checkout, another window) is always used and never replaced or stopped;
  another program on the port, or a receiver of the same data directory on another port, means nothing is started and
  the extension says why. A newer extension replaces the receiver an older one started; an older one keeps using a
  newer receiver. New commands: *Receiver Status*, *Stop Receiver*, *Show Receiver Log*, *Open Control Center (Pairing
  Link)*; new setting `resonance.startReceiver` (on). The **Code Resonance** Output channel records each decision.
  `npm run up`, `npm start` and the repository's flows are unchanged.
- **Agents from the extension.** *CR › Connect an AI agent…* adds or removes the observe-only Claude Code, Cursor or
  Codex hooks for the workspace through the receiver's own plan and apply (the Control Center's rules), after showing
  the exact change in a diff editor. The receiver the extension starts keeps the hook adapters in `hooks/` in the data
  directory, a path that survives extension updates, and the hook entries it writes name that path.
- **Marketplace and Open VSX, prepared:** icon, banner, links, keywords and a README written for the extension's page;
  the VSIX manifest now follows vsce (its identity `Id` is the extension name with the publisher apart, where it was
  `publisher.name`; tags, gallery flags, links, branding, changelog and icon assets; a content type for every file
  extension). Not published: the steps are in [docs/PUBLISHING.md](docs/PUBLISHING.md).
- **The extension honours `RESONANCE_DATA`** in VS Code's environment, like the receiver, the hooks and the command-line
  tools (it always read `~/.code-resonance` before).
- Qualification: `qualification/vscode/bundled.js` runs the VSIX's own extension folder in a real VS Code with no
  receiver running (two windows, isolated profile, a free port).
- **Languages:** dependency-free adapters for Go, Rust, Java, Kotlin, C#, Swift, C and C++ (headers too), PHP and
  Ruby, over a shared lexer that blanks strings and comments in place (`engine/languages/scan.js`). Each recognises its
  types, members, functions and globals, and framework routes with a literal path: net/http (Go 1.22 patterns) and
  gin/echo/chi/fiber; axum, actix and rocket; Spring, Micronaut, JAX-RS and Ktor; ASP.NET attributes and minimal APIs;
  Vapor; Crow; Laravel, Slim and Symfony; Rails and Sinatra. A construct a scanner cannot read reliably yields no
  symbol; each adapter's header says what it leaves out.
- **Imports between modules:** Go import paths under a go.mod module resolve to a file of the package directory (the one
  named after it, never a `_test.go`); Rust `mod`/`use` follow the 2018 module rules, and Cargo.toml crate names link a
  workspace; Java and Kotlin packages resolve by folder (src/main/java beside src/main/kotlin); C# namespaces are
  candidate folders only; `#include` resolves beside the file and in the enclosing include/ folders; PHP `use` through
  composer.json PSR-4 prefixes; Ruby `require_relative`; Swift `import` to Sources/<Module>.
- **Deeper Python:** Protocol and ABC classes are interfaces; TypedDict, `X: TypeAlias`, `type X =` and NewType are
  types; Django `path()`/`re_path()` (urls.py or urlpatterns), Flask `add_url_rule`, FastAPI `add_api_route` and
  Starlette `Route()` are routes, and a route decorated inside an app factory is a route. 555 of the 574 files of the
  Python 3.12 standard library analyse exactly as before; the other 19 differ only by these kinds.
- **Tests as validation:** each language's convention marks its test files (`_test.go`, Rust `benches/`, `src/*Test/`
  for Java and Kotlin, `*Tests.cs` and `*.Tests/`, `_spec.rb`, `*Test.php`, Swift `Tests/`, `_test.cc`, `test_*.py`,
  `*_test.py`, `conftest.py`).
- **Language mix:** `languageOf` adds java, kt, cs, swift, c, cpp, php and rb; the performance view passes them to packs
  instead of `other`.
- **Extension:** `SOURCE_GLOB` covers every analysed file type plus go.mod and Cargo.toml (one flat brace group, as VS
  Code globs do not nest braces); the command classifier knows the new toolchains' test, build, lint, typecheck,
  format, install and run commands.
- **Not verified:** Rust, Kotlin and Swift were checked on fixtures only (no real code in those languages was available);
  the glob was checked against the glob parser of the installed VS Code server, not in a running VS Code.
- **Fractal Continuum (preview), a precious finish instead of "gum":** the owner found the preview read as one soft
  purple, evenly lit, rounded by the swell and coated in white sparkle. Each subsystem's region now takes its own hue on
  the identity's harmony (`palette.scheme`: an arc from the surface's hue toward the light's hue, or 150°/120° for split
  and triad, never through the olive band between amber and green), turned darker toward the depth colour in the
  crevices, lighter along the arc on the ridges and further at grazing angles. The light is a hard key from the side
  with a soft shadow traced toward it (6 steps at quality 0, 4 at quality 1, two taps at 2 and 3), occlusion deep enough
  to blacken the crevices, a dim fill that takes the surface's colour, a back light in the light's hue on the rims;
  exposed surfaces and orbit-trap ridges are glassy and metallic, the depths matte. The swell's amplitude halves as the
  recursion unfolds (it no longer shears the fine structure), normals are taken over two pixels and the finest
  recursion drawn stays above two pixels (no sub-pixel sugar), and glints are rare, coloured and denser where a region
  holds more files. Every behaviour, the recipes and their pinned outputs are unchanged; GPU time per frame at
  1920×1080 on the AMD iGPU stays where it was (Lumen's 14 lab stills 15.6–19.9 ms after, 15.5–20.5 ms before). Stills
  and numbers: `docs/worlds/fractal-continuum.md`; `tests/fractal.test.js` pins the region hues, the swell and the
  shadow per quality.
- **More agents (observe-only hooks).** Gemini CLI, Qwen Code, GitHub Copilot (CLI and VS Code's Copilot harness),
  Factory Droid, Grok Build and goose now have adapters (`scripts/hooks/<tool>.js`, one shared runtime) and installers:
  `npm run hooks:gemini|qwen|copilot|droid|grok|goose -- <project>`, or Connections › *More agents*. Each adapter was
  written from its tool's hook documentation (cited in its header, checked 2026-10-30) and tested against those
  documented payloads only; **no real session of these tools was run**. The rules are the same as for Claude Code,
  Cursor and Codex: paths that pass the extension's filters, tool names, command categories, prompt and reply lengths
  and fingerprints; never prompt text, replies, command lines, tool arguments, edit strings or file contents; nothing on
  stdout, always exit 0, the token only to a receiver that proves it holds it. No installer registers an event that
  can deny, block or rewrite (`BeforeTool`, `PreToolUse`, `PermissionRequest`, `preToolUse`, …). None of these payloads
  documents a shell exit code, so their commands show a category and, at most, *failed*. Copilot and Grok Build name no
  files, and Droid only for `Create`. The research matrix (which tools document what, and why Kimi, Cline, Windsurf,
  Kiro, Augment, Junie, OpenCode, Amp, Continue, Roo Code, Aider and Zed have no adapter yet) is in
  [docs/AGENTS.md](docs/AGENTS.md).
- **CAST catalog.** New providers: `gemini` Gemini (seat 5), `copilot` Copilot (6), `droid` Droid (7), `goose` Goose (3).
  These names are for `scripts/event.js --provider`: `opencode` OpenCode (4), `cline` Cline (6), `windsurf` Windsurf (3),
  `amp` Amp (7), `kiro` Kiro (5), `augment` Augment (4), `junie` Junie (6), `aider` Aider (7). The worlds and the score
  have eight seats (colour, signal shape, voice), so these providers share a seat with Claude, Cursor, Codex, Grok, Qwen
  or Kimi. Those six keep their seats, names and colours. A chip names its provider, and sessions are numbered per chip.
  Uncatalogued ids still read *Agent* and hash into seats 6–7. The Stage, hover cards, Home's *Last night*, the
  Control Center and `npm run doctor`, which now lists the agents it observed, all show the new names.
- **Interpretation impact (part of version 10).** The reducer reads `presence()` for an agent's seat and
  counts collisions only between catalogued providers. A journal whose events name one of the twelve new ids is
  interpreted differently once its projection is rebuilt. Its agent's voice is the catalogued seat, where it used to
  be a hash into 6 or 7, so its colour, shape and pan can change. Its edits can now form an `agent.collision` with
  another catalogued provider. Its chips read the product name instead of *Agent*. Projections built before this change
  keep their old reading until the interpretation version changes, which the language-adapter work does with version 10.
- **Receiver.** `/api/integrations/<tool>/plan|apply` for each new tool, behind the control capability, with the same
  review-then-write flow. Every folder on a nested hook path (`.github/copilot`, `.grok/hooks`,
  `.agents/plugins/…/hooks`) is refused if it is a link, not only the last folder. `GET /api/integrations` lists the
  tools with their observed projects (and the adapter path only with a capability). Providers with an adapter are
  *first-party*.
- **Connections.** A *More agents* section with one tab per tool. Each tab shows its observed activity per project
  (marked when the events did not come through its hook), what the hooks send and never send, the file and the events
  installed, the trust rule and a link to the tool's documentation. The same plan, review, write and remove flow is
  there too. The overview strip has a seventh channel. *Other agents* no longer lists providers that have their own
  section. The page is checked at 1920×1080 and 1280×720.
- **Known limit.** Copilot (and Grok Build, Devin) also read the repository's Claude Code hook files. With Claude Code's
  hooks installed, a Copilot session in that project can also appear as Claude.
- **Vertical clips (9:16):** `npm run film -- --project <id> --vertical` (or `--aspect 9:16`) renders the night's best
  moment for Instagram Reels, YouTube Shorts and TikTok: 1080 × 1920, `--duration` seconds of film (default 30) at the
  highlight's speed, centred on its key moment (of the moments that made the night score, the one whose clip scores
  highest by the same rules; `engine/highlight.js` `clip`), opening on the title card and ending on a 3-second end card
  with the public title and *Code Resonance*, the music faded in (1 s) and out (2.5 s). H.264 and AAC in MP4
  (`last-night-vertical.mp4`; the bundled ffmpeg-static 6.0 has libx264 and aac), or `--format webm`. The film's
  public-title gate and `--copy` apply unchanged. The wrapper also passes `--world` and `--family` through, and the
  renderer can now film Monolith (`--world city`).
- **Portrait framing:** every world frames a frame taller than it is wide (Stellar Forge sees the galaxy from higher
  with the core centred, Machine Cathedral stands back and fits the city's width, Fractal Biosphere centres its anchor,
  the Construct fills the width, Monolith stacks its words); Fractal Biosphere, Synaptic Storm, Fractal Continuum and
  visual packs get the host's rule (the field of view kept across the width; a pack that frames portraits itself sets
  `framesPortrait: true`). Words in a portrait are sized by the short side
  and kept inside the area the platforms leave clear (under the top 12 %, above the bottom 20 %, side margins):
  `public/worlds/labels.js` `textScale`, `safeArea`, `portraitPlaces`. Landscape output is unchanged: films rendered
  with the default arguments by 0.7.2 and by this change give byte-identical frames (the page's JPEG frames and every
  decoded video frame of the WebM, in five worlds); the WebM files differ only through the music, whose offline render
  already differs by at most one 16-bit step in about 1 % of samples between two runs of 0.7.2. Landscape labels are
  pinned by a test.
- **Control Center:** Record & Broadcast offers a **Vertical** recording profile (1080 × 1920, 8 Mbit/s; also in
  Settings; the receiver accepts `recording.profile: "vertical"`), and the Deterministic film card shows the vertical
  clip command next to the film's, behind the same public-title gate.
- Tests: `tests/vertical.test.js` (portrait words and safe area, landscape labels unchanged, the clip window, the
  wrapper's arguments, MP4 encoding, the host's portrait rule); the Output interface suite records a vertical file and
  checks the page at 1920 × 1080. Not verified: uploads to the platforms themselves.

## 0.7.2 — 2026-10-29

Product 0.7.2, for use on your own machine; not stable. Interpretation **9** (8 in 0.7.1): on its first start the
receiver rebuilds each project's derived files once from its journal (below). This tag is `v0.7.2`. The VS Code
extension is 0.7.2 (`code-resonance-0.7.2.vsix`); a receiver started before this release has no v2 token proof, so
restart it after updating. Synaptic Storm and Fractal Continuum are previews, chosen only explicitly in the Visual
Studio; no existing identity changes.

- **License:** Code Resonance is released under the MIT License ([LICENSE](LICENSE)); it was unlicensed before. The
  included three.js (MIT) and TypeScript (Apache-2.0) keep their own licences
  ([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)). The VSIX carries the licence as `extension/LICENSE.txt`.
- **Synaptic Storm (preview):** a fourth built-in world family, chosen only explicitly (Visual Studio, marked
  *Preview*; the render lab's `--family synaptic-storm`). Subsystems are clusters of glassy neurons placed by a force
  layout over the real dependencies, files are dendrite branches, symbols boutons, dependencies axons; agents travel as
  signals in their CAST colour and shape and make the neuron of the file they edit fire; tests sweep activation waves,
  failures misfire and dim their neighbourhood, recovery resynchronises, and a verified milestone with the director's
  token, at least 4 minutes after the last, earns a synchronous storm. Idle firing sits on the score's beat grid. Never
  part of the family scores: the recipe generator stays at version 4 and every existing identity is unchanged
  (`tests/recipe.test.js` as pinned; `tests/synaptic.test.js` new). `/api/catalog` lists it under `previews`. No
  digital life yet. Design brief and stills: `docs/worlds/synaptic-storm.md`.
- **Fractal Continuum (preview):** a fifth built-in world family, chosen only explicitly (Visual Studio, marked
  *Preview*; the render lab's `--family fractal-continuum`). One raymarched, distance-estimated fractal: the code's
  character picks its universe (Mandelbulb, Julia bulb, Mandelbox or kaleidoscopic crystal) and its parameters from the
  identity's own stream, and the live code unfolds its recursion. Subsystems are regions of the surface that swell with
  their files, files are sites of light traced onto it with a JS twin of the estimator, dependencies are threads of
  light; agents travel as signals in their CAST colour and shape and ripple the surface around the file they edit;
  tests send a coherent wave, failures make the covered region decohere in the warning colour, recovery restores
  coherence, a commit glows from the crevices, and a verified milestone with the director's token, at least 4 minutes
  after the last, earns a fractal bloom. Idle: breathing, a circling light, glints and pulses on the beat grid. Drawn at
  0.6 of the resolution at quality 0 (less at 1 to 3, and when it fills the frame) in a coarse cone pass, a march and a
  shading pass; measured 15–20 ms GPU per frame at 1920×1080 on the AMD iGPU over the brief's stills on Lumen, up to
  25 ms in a close-up that fills the frame (Self). Never part of the
  family scores: the recipe generator stays at version 4 and every existing identity is unchanged (`tests/recipe.test.js`
  as pinned; `tests/fractal.test.js` new). `/api/catalog` lists it under `previews`. No digital life yet. Design brief
  and stills: `docs/worlds/fractal-continuum.md`.
- **Synaptic Storm up close:** each axon now ends in a synaptic terminal, a glass bell of vesicles facing a cup on the
  receiving branch; a spike's arrival sparks across the cleft and the vesicles at the mouth cross it. Branches are
  seamless tubes (consecutive segments share their joint, free ends are rounded) whose trunks swell at the soma, with a
  web of fine filaments and gold specks on their membranes and gold beads along every fibre; somas have lobed
  membranes, organelles and a bright nucleus inside two shells. A recorded event the director gives attention is seen
  up close, an agent's work in a medium close-up. The detail is drawn only where it is large enough on screen to read,
  and not at quality 3. Behind the network, the far tissue: out-of-focus fibres with bokeh nodes in every direction
  (atmosphere, never code; about 1–2 ms on an integrated GPU at 1080p). The render lab takes `--after` (seconds after
  each event, with `--events`). The brief's stills are now rendered on a GPU.
- **Several agents at once:** sessions of the same tool running together are numbered in public labels and the hover
  card (*Claude*, *Claude 2*; the lowest number free, so a lone session is just *Claude*). The README and the first-run
  guide explain running several agents on one project (two Claude Code terminals, Cursor chats, Codex): hooks once per
  project and tool, each session its own presence; agents without hooks are not presences, their edits arrive
  unattributed. `tests/agents-multi.test.js` new.
- **Fractal Continuum with more than 24 subsystems:** every subsystem now has a region of its own. The 25th subsystem
  and later reused the first 24 directions, so two subsystems were drawn as one region with their names on top of each
  other (VS Code's 49 built-in extensions, indexed as a project: 49 regions on 24 directions). The sequence of
  directions now continues past 24; its first 24 are bit-identical (4,000 seeded sequences compared), so a project with
  24 subsystems or fewer looks exactly as before. `tests/fractal.test.js`.
- **Synaptic Storm without dependencies:** the world no longer stops with an error while nothing in the project links
  yet (a new project, or the first moments of a replay or film from the start: `Cannot set properties of undefined
  (setting 'needsUpdate')` since the preview was added). `tests/synaptic.test.js`.
- **Fractal Continuum, review fixes:** the layout follows every birth and removal exactly (it was rebuilt at most once
  a second, so a file born mid-second appeared late when played through but at once when sought); waves, recoveries,
  glows and blooms stay on their own file when a new file reorders the layout; files missing from the model leave no
  stale position for threads and composition anchors; an attributed edit ripples and flares in one agent's colour. The
  swell table keeps each region's kernel and sums only the swell again while a project grows (it was rebuilt almost
  every frame, 26 ms at 49 subsystems; byte-identical output), and the first bloom's 3,200 surface traces run on the
  world's first frame instead of the milestone's. `tests/fractal.test.js`.
- **Labels keep clear of each other:** when two agents work side by side their chips no longer print over each other
  or over an event's callout (each takes the first free place around its agent, or its old one when none is free); in
  explorer mode a subsystem's name steps down or up from the others and is left out where every place is taken (the
  hover card still names it). `tests/privacy-labels.test.js`.
- **Visual Studio, preview worlds:** they show a thumbnail rendered from the project like the three; their state reads
  *In design* (no longer "Preview" beside "Previewing"); the strip shows a peek of the card past its edge at every
  width (at 1920×1080 the fifth world was hidden); a preview world's panel says that look packs and the Artist Studio
  are for the three flagship worlds, instead of sending you to Visual Packs.
- **Films:** a render that fails ends at once instead of waiting forever on its encoder (and keeping its copy of the
  data in `/tmp`); with no frames rendered, `--out` is left as it was.
- **Public repository:** REPOSITORY.md no longer calls it private; SECURITY.md says how to report a vulnerability
  privately (GitHub's private vulnerability reporting); the README's hero caption says the Cursor and Codex events in
  that film were posted through their adapters, Claude was a live session.
- **Hover details:** resting the pointer on the living world, wherever a view shows it (the Stage, Home's live
  preview, the studios, Record & Broadcast), shows a small card beside the pointer: the world's own words for what is
  there, then what the player knows there at that moment (agents at work or that used a tool there and how long ago,
  the newest test verdict and edit, a subsystem's file count and states). At most ten picks a second; it keeps clear
  of the Stage's controls and hides on leaving, any key, scrolling, dialogs, a resting Stage, touch input and the
  information modes Stream and Off. It is page markup over the stage, never drawn into it: recordings, films and the
  OBS view never contain it. Catalog and generated names only.
- **Agent touches:** each edit an agent makes now shows in the flagship worlds for a few seconds (an edit's tool event
  lasts milliseconds, so the presences never visibly reached the file). Fractal Biosphere: the branch flares in the
  agent's colour, a pulse runs up it into the crown and a ring opens at its tip; Stellar Forge: the world flares with a
  ring, its orbit lights and a streak runs from the comet; Machine Cathedral: the tower's windows light in a quick
  cascade, a glint and a halo ring at the top. Reads and searches are gentler. Rate-limited per file, at most four at
  once, a pure function of the recorded presences (replays, seeks and films show the same), presentation only (never
  the director, the recipe or digital life). Swarms and servitors visit the file they just touched and burn brighter
  while they work; comets brighten.
- **Explorer:** clicking a structure also draws the camera a little toward it (the world's own goal, the same rig).
- **Packs:** the pack frame takes no pointer input; explorer clicks and the hover reach a pack's world through the
  player (`pick`, `peek`). A pick no longer counts as a frame in flight (it held back renders and could trip the
  watchdog).
- **Render lab:** `--touch` renders stills during the first recorded edit and read (`qualification/visual/lab.js`).
- **Stellar Forge:** "0 dependencies" (it said "dependencys").
- **Worlds:** the choices are now Living world, The Construct and Monolith. Nexus and Nebula, two Canvas 2D stages,
  are retired. A setting or project preference that names one still loads as Monolith (the receiver never rewrites a
  file for reading it; the document's next write stores Monolith), and a URL pin `?world=nexus` or `?world=nebula`
  (an OBS bookmark) shows Monolith. A new write that asks for a retired world is refused (400, `stage.world` or
  `world`). Recipes and packs are unaffected.
- **Monolith** is redrawn as a flat architectural elevation of the site plan (`public/worlds/monolith.js`): files are
  towers on their persisted plots, storeys their symbols, districts in the project's palette, dependencies as arcs
  below the ground line, with a public title, counts and a district legend. Motion is calm and follows the cues;
  reduced motion stills it. An unchanged frame is copied from a cached layer: on a 450-file project in headless
  Chromium with software rendering, 18 ms of script per second while idle (0.7.1's Monolith: 164 ms).
- **Generated subsystem names** (`generatedName`) move from `host.js` to `labels.js`, unchanged, so the 2D world can
  use them without three.js.
- **Token proof for every client, bound to the port:** the extension's capture outbox, the Claude Code, Cursor and Codex
  hooks, `scripts/event.js` and `npm run demo` now verify the receiver before they send `Authorization`; in 0.7.1 only
  `npm run up`, `npm run pair` and the extension's pairing link did. The proof is now
  `GET /v1/challenge?nonce=&v=2` → HMAC-SHA256(token, `cr-challenge-v2|<port>|<nonce>`) for the port the request arrived
  on, and no client follows a redirect, so a process on one port can no longer pass by redirecting to, or relaying, a
  real receiver on another port. The outbox verifies once per receiver connection (again after a failed delivery or a
  changed port); the hooks and CLIs once per run. An unverified occupant gets nothing: hooks spool and exit 0, the
  outbox keeps its batches (status *queued (receiver not verified)*), the CLIs exit with an error. One client
  implementation, `extension/proof.js` (now in the VSIX), re-exported by `receiver/proof.js`.
  **Compatibility:** the receiver still answers the 0.7.1 form (`?nonce=` without `v`) for an extension installed
  before. A receiver started before this change has no v2 proof: restart it. Until you do, the updated hooks spool and
  the extension queues their events, and `scripts/event.js`, `npm run demo`, `npm run up` and `npm run pair` refuse.
- **Interpretation 9 (projects rebuild once):** the `agent.collision` cue now weighs 0, like every other agent cue. In
  8 it weighed its magnitude (0.4–0.6) and fed progress, energy and the chapter, so two agents on the same files raised
  an existing project's chapter on rebuild; now a two-agent journal has exactly the progress and chapter of the same
  journal with one provider. Collisions count only catalogued providers (Claude, Cursor, Codex, Grok, Qwen, Kimi):
  `unspecified`, `external-agent` and other ids still attribute their edits but never make a meeting. The catalog
  lookup ignores Object members (`constructor`, `__proto__`, …). On the first start each project's derived files are
  rebuilt from its journal (the journal is not rewritten). The collision intent and its magnitude are unchanged, so the
  living worlds' meeting and the score's accent figure are as before; a window with a meeting now has slightly lower
  energy and growth (they summed cue weights), and the Canvas 2D stages pulse it at their base speed.
- **Public agent names:** an agent whose provider id is not in the catalog is "Agent" on Stage chips, in collision
  callouts (Biosphere, Stellar Forge, Machine Cathedral) and in Home's Last night cast, instead of its title-cased id
  (`external-agent`, a client's name passed with `--provider`). The Control Center's own lists still name the id.
  Visual packs receive a provider only as a catalog id (it was any lower-case slug).
- **Highlights cannot stall the receiver:** the picker (`engine/highlight.js`, `GET /api/highlight`, `npm run film`)
  scored every candidate window by scanning it; a failure recovered more than 24 minutes later made every intent of the
  red period a candidate, so the cost grew with the square of the history, on the receiver's main thread (measured:
  5.0 s for 50,000 intents with a 6.8-hour red period). It now scores the same candidates with one sliding pass per
  kind: the same night takes 48 ms, a million intents 0.5 s, a million with 200 failures, a six-hour red period and
  40,000 anchors about a second. The choice is unchanged: the tests compare it with the 0.7.1 picker on the existing
  fixtures and 600 seeded random nights.
- **Last night is the last day:** the highlight is chosen from the last 24 hours of the project's own recording
  (measured from its last window), and from the whole history only if nothing there scores; the receiver then parses
  only those windows. Home asks for it at most once per 30 s per project, and again only after the project's recorded
  performance grew (it asked on every project update while there was none, and never refreshed one it had).
- **`npm run film` ends cleanly:** a failure after the temporary receiver started (a software renderer where a GPU was
  asked for, a refused look or tune, a browser that would not launch, a failed frame) left it and the ffmpeg encoder
  running, so the command never returned; now every failure stops them. The temporary copy of the data directory
  (with `receiver-auth.json`) was removed only on a normal exit; now also on Ctrl-C, SIGTERM and SIGHUP, and the wrapper
  passes a signal on to the renderer and waits for it. A GPU the wrapper detected itself (no `--gpu`) that the browser
  cannot use now falls back to software with a message instead of failing; `--gpu auto|amd|nvidia` still insists.
  `--gpu` accepts only `auto`, `amd`, `nvidia` or `off`.
- **Hook installers:** removing the Codex adapter from the Control Center (or merging it again) left its handler in
  place when it shared a group with one of your own hooks (the group count did not change, so the event looked
  untouched); it is now removed and your hook stays. The Connections plan and apply for Claude Code, Cursor and Codex
  refuse your home directory and anything that resolves to it: `~/.claude`, `~/.cursor/hooks.json` and
  `~/.codex/hooks.json` are user-level and run in every workspace. A project folder inside the home directory is fine.

## 0.7.1 — 2026-10-28

Product 0.7.1, for private use on your own machine; not stable. Interpretation **8** is unchanged. The last published
GitHub Release before the 0.7 series was `v0.6.0`. This tag is `v0.7.1`. The VS Code extension is 0.7.1
(`code-resonance-0.7.1.vsix`).

- **Ecology CI:** Biosphere, Stellar Forge and Machine Cathedral each run as their own Node test file so the 120 s
  suite timeout no longer cancels them on 2-core GitHub runners. Assertions and Cathedral's 20 Hz sampling are
  unchanged. The global `--test-timeout` is still 120 s.
- **Pairing proof:** `GET /v1/challenge?nonce=` returns HMAC-SHA256 of the ingestion token over a client nonce.
  `npm run up`, `npm run pair` and the extension verify that proof before they send `Authorization`. A leftover
  occupant that only mimics `/health` (even with a planted `receiver-auth.json`) never receives the Bearer token. A
  receiver from before 0.7.1 has no challenge: restart it.
- **Agent outcomes:** Claude, Cursor and Codex omit `exitCode` and `result: succeeded` for Bash when the hook payload
  has no numeric exit. `PostToolUseFailure` still parses `Exit code N`. Edit/patch completion still records success
  from the after-hook firing.
- **Highlights:** `inWindow` is a binary search on sorted timestamps. `GET /api/highlight` caches by
  `performance.jsonl` mtime and size.
- **Labels:** agent chips and explorer labels stay inside the frame (flip, then omit). Overlay drawing clamps measured
  boxes.

## 0.7.0 — 2026-10-28

Product 0.7.0, for private use on your own machine; not stable. Interpretation **8** (CAST seats from the provider
catalog, `agent.collision` when two providers share a file or district inside 60 s) is independent of this product
version. The last published GitHub Release at the time was `v0.6.0`. The VS Code extension is 0.7.0
(`code-resonance-0.7.0.vsix`).

This version is the CAST campaign stack: first-run, the CAST catalog, Cursor and Codex observe-only adapters, Home Last
night and the publish film path, and the operator runbook. The README hero is a 70-second CAST session of Pulse.
Overnight CAST and a public OBS night remain. [docs/campaign-0.7.md](docs/campaign-0.7.md).

### First run (`npm run up`)

- `npm run up` (~60 s): probe 4174, reuse a Code Resonance receiver or start one, refuse a foreign occupant (no token
  write, no pairing, no browser), print a pairing link, build the VSIX, optionally install and open, post a labelled
  fictional demonstration only if there is no real project yet.

### CAST catalog (interpretation 8)

Interpretation 8 is named independently of product 0.7.0. Rebuilding derived files from a journal follows the
interpretation version, not the product version.

- Provider catalog: Claude, Cursor, Codex, Grok, Qwen, Kimi on stable seats 0–5; unknown ids hash into seats 6–7.
- Stage chips show catalog names. Worlds draw CAST presences in the project's grammar (fireflies, comets, servitors);
  no vendor art styles.
- Last-writer still attributes an edit; two providers on the same file or district inside 60 s emit `agent.collision`
  (an intent plus a derived cue). Worlds express it; they never invent one.

### Cursor observe-only hooks

- Project `.cursor/hooks.json`. After-hooks only. **Never** `subagentStart` (a permission hook: empty stdout denies
  Task spawn). Prove only in a trusted workspace. Connections: `POST /api/integrations/cursor/{plan,apply}`.
- Adapter never persists edit hunks, command lines or command output.

### Codex observe-only hooks

- Project `.codex/hooks.json`. **Never** `PreToolUse` or `PermissionRequest` (they can deny). Paths only from patch
  headers. Prove only when the project `.codex/` layer is trusted. Connections:
  `POST /api/integrations/codex/{plan,apply}`.
- `ACTIVITY.apply_patch = editing`. Adapter never persists patch hunks, command lines or tool output.

### Last night and films

- Deterministic highlight picker (`engine/highlight.js`, `GET /api/highlight`): Home **Last night** is a sped-up replay
  of that window (default 4×; 16× when the scored window is long). Playwright is not involved.
- `npm run film` is the publish path: always `--copy`, default cinematic labels, title-gated, default out
  `qualification/results/films/last-night.webm` (never committed). Play still works without a public title; a film does
  not (unless `--allow-untitled`). Uses a hardware GPU when one is present (`--gpu auto|amd|nvidia`; `--gpu off` is
  software).
- Visual Studio **Propose public names** fills aliases from role plus `generatedName` (`Craft - Vauos`); writes only on
  Accept. The hyphen is required because aliases reject a middle-dot.

### Campaign runbook

- Operator checklist for one overnight CAST session, a morning reel, a 60–90 s README hero, and a later public OBS
  night. The README hero is the 70 s Pulse CAST film (`docs/media/code-resonance-cast.mp4`). Overnight CAST and a public
  OBS night remain.

## 0.6.0 — 2026-10-27

The first tagged release, `v0.6.0`: four milestones built on 0.5.0 and the final consolidation, integrated into `main`.
For private use on your own machine; not stable. The VS Code extension is 0.6.0 with the same code as 0.5.0 (only its
version changed), so reinstalling it is optional. The product version is separate from the versions of the data formats,
the score, the Visual Recipe generator, digital life and the Visual Pack SDK, which these milestones did change: they
are listed, with the rules that keep existing identities as they were, in
[ARCHITECTURE.md](ARCHITECTURE.md#versions-and-compatibility).

### Final consolidation

No intended change of product behaviour. The pull-request stack is integrated into `main` with merge commits
([integration manifest](docs/history/integration-manifest.md)).

- **Documentation:** an index ([docs/README.md](docs/README.md)) with a map of the history by pull request; a current
  operations guide (`docs/OPERATIONS.md`) in place of the 0.4.0 alpha notes, which move to `docs/history/`; the
  getting-started guide covers the creative workflows; ARCHITECTURE is the developer guide with the versions table and
  the HTTP API; SECURITY covers Artist Studio compositions; historical records are labelled; SDK 1.2 is named as current.
- **A test** keeps the Control Center's documents, the receiver's allowlist and every Markdown link consistent
  (`tests/docs.test.js`).
- **Code:**
  - Removed dead code: Cathedral layout helpers unused since life grammar v3, the score's uncalled `pitch()`, unread
    bindings, unused CSS, the Construct's leftover state, and two orphaned composition wording helpers. Score and
    composition output is unchanged; the digests are pinned.
  - One source per module system for the music vocabulary (styles, profile keys, mix groups, tempo limits), with
    parity tests. The Music Studio reads room sizes from the engine.
  - One reduced-motion rule and one copy of the information-mode descriptions.
  - The pure quality governor now lives in `public/worlds/quality.js`; the composition export helpers in
    `public/ui/creations.js`, which also styles the export dialog in Visual Packs; the Claude Code hook format sits
    with its installer.
- **Fixes:**
  - A stopped receiver no longer holds Node open for 10 s.
  - A preview that settles after the Artist Studio is left no longer re-sets the draft.
  - The 2D stages' ripple backlog is bounded.
  - The per-frame state no longer hashes the whole ecosystem to read the quality level.
  - A test no longer leaks temporary folders.
- **Validation hardening:**
  - Composition layer types and pack base families are looked up as own keys only (`constructor` was accepted or
    crashed).
  - Values that cannot become a number or a string no longer crash validation.
  - Validation reports at most 24 problems.
- **Tooling:**
  - `npm run check` finds its files itself (`scripts/check.js`, proven to cover the old list).
  - CI jobs have timeouts with margin and run on pinned `ubuntu-24.04`.
  - The parameter catalogue is regenerated for SDK 1.2 and guarded by a test.
  - Personal machine paths are removed from tracked qualification reports.

### Creative mastering and the Artist Studio (PR #11)

Music that develops, digital life that answers it, cinematic finishes, and a workbench for original compositions. Built
on the digital-life branch. Existing identities keep their sound and image until deliberately upgraded: new behaviour
sits behind versions (recipe generator v4, score v3, ecology 2).

- **Composed score (v3)** (`public/score.js`, `public/music.js`, [docs/MUSIC.md](docs/MUSIC.md)):
  - Long-form arcs: statement, development, interlude, return and release.
  - Antecedent and consequent phrases built from the project's motif, with a second idea per arc.
  - Voice-led harmony with sevenths, ninths and a resolving suspension; a guide-tone countermelody; a bass that walks
    or holds a pedal.
  - Roles that enter and leave at passage boundaries; dynamics that breathe.
  - Four styles with their own characters.
  - New voices: a pre-delayed room kept out of the bass, band-limited pulse waves for chip, a kit per style.
  - The low end rebalanced by arrangement rather than EQ.
  - Measured on a recorded session: loudness range 1.6–3.7 LU (v2) to 5.5–12 LU (v3) at about −23 LUFS.
- **Music Studio:**
  - Character controls: mood, evolution, melody, rhythm, atmosphere, harmony, dynamics, space.
  - A balance (level and mute) for each voice the style can sound.
  - Four curated starting points; presets that keep the profile.
  - A one-click upgrade to the composed score.
- **Musical expression for the visuals** (`public/worlds/musical.js`): the score's conducted state read from recorded
  frames on the shared clock, never from the audio device.
- **Ecology 2** ([docs/LIFE.md](docs/LIFE.md)): music shapes conditions, not choreography. That means currents,
  gathering, exploration, persistence, light, rhythmic pulses and a turning attractor. Each world interprets them its
  own way:
  - Biosphere: migrations between crowns, beyond the dominant organism.
  - Stellar: density waves and streams, with no faster rotation.
  - Cathedral: convoys on the musical grid, routes and lit channels.

  The music also shows in each world's light, in its inhabitants' brightness, size and traces (presentation only,
  from the relaxed conditions). Music influence 0 is exactly neutral and renders exactly as before; 1 is musical; 2 is
  expressive. Against music 0 at the same moment, the picture's systematic swing went from 0.05–0.87 to 2.0–4.7 at
  music 1 and 4.6–9.7 at music 2 (luma sd), with no flicker.
- **Finishes** ([docs/WORLDS.md](docs/WORLDS.md)): Clean, Cinematic (the default for new identities) and Dreamlike, in
  the existing composite pass.
  - An optical chromatic aberration: radial, spectral, highlight-sensitive.
  - Fringe on the bloom, halation, split toning that keeps the blacks, and mist.
  - Classic is bit-identical to before.
- **Artist Studio** (`#/artist`, [docs/ARTIST-STUDIO.md](docs/ARTIST-STUDIO.md)): compositions of procedural layers
  over a flagship world or the minimal artist canvas.
  - Six layer types: fractal geometry, particle populations, ribbons and flow, geometric structures, atmospheric
    fields, light accents.
  - Anchors on the project's own structure, honest depth classes, and reactive mappings from musical, canonical
    engineering and environmental signals.
  - Preview in one window, save with versions, apply to a project.
  - Export and import as data-only declarative packs (SDK 1.2): nothing executable, validated, no private data.
  - Four creator starters and a blank canvas. A layer that fails is set aside with its reason; the rest keeps drawing.
- **Control Center:**
  - Home: Create a composition, and Continue.
  - Visual Studio: Finish, chromatic aberration, a Phase 11 upgrade, and Open in Artist Studio.
  - Visual Packs: My creations, Imported creations and looks, Shader packs, Full coded worlds.
  - Projects: Composition, Finish and Music profile rows.
- **Reference packs:** Ember Observatory 1.1.0 and Blueprint Cathedral 1.1.0, clearer over the flagship worlds.

### Digital life (PR #10)

Autonomous inhabitants in the three flagship worlds ([docs/LIFE.md](docs/LIFE.md)). Built on the desktop experience.

- **A deterministic ecosystem** (`public/worlds/life/`): entities with inertia and bounded steering on a fixed step,
  shared fields they deposit into and sense (trail, energy, disturbance, momentum), sites with conditions, bounded
  lifecycles that reuse their slots. Checkpoints restore exactly; every frame rate and every seek path reaches the same
  state.
- **Three ecologies:** in the Fractal Biosphere pollinators, spores, plankton colonies and drifters gather on the
  organisms' crowns and move on; in the Stellar Forge dust streams, accretion fragments, charged motes and stellar wind
  follow the galaxy's rotation and density waves; in the Machine Cathedral couriers, wardens and sparks travel the
  city's own routes, never through stone.
- **Engineering, not choreography:** canonical intents become bounded site conditions (novelty, nourishment, strain, a
  vortex after a validated refactor, a lasting attractor for a verified milestone); a failure scatters life and a
  recovery lets it return. Inhabitants never stand for agents and are never labelled.
- **The music's climate:** the score's sections on the performance clock shape the conditions; *Music influence*
  (`life.music`, 0 to 2) sets how much, and 0 keeps them neutral.
- **Replays and films** live in generations of ten minutes, so a far seek is bounded; the next generation is prepared in
  the background and handed over with a crossfade. A live session keeps its population through tempo changes and folds
  its inputs to bound its memory.
- **Recipe generator v3** adds `life` to new built-in identities from its own random stream (every v2 value
  unchanged). Stored identities have no life until the Visual Studio's *Digital life* switch turns it on; life off
  renders exactly as before.
- **Auto quality** also steps down when the GPU timer misses part of a slow frame (Stellar Forge at 1920×1080 on the AMD
  integrated GPU: High at 19 fps before, Low at 57 fps after).
- **Qualification:** `visual/life.qual.js`, `life-perf.js`, `life-cpu.js` and `life-music.js`; `unchanged.qual.js`
  compares the worlds with life off; films kept locally.

### Desktop experience (PR #9)

The Control Center redesigned for desktop screens, from 1280×720 to 2560×1440. Built on the flagship worlds.

- **Type and layout:** a readable type scale (body 14 px, nothing under 12 px), a wider rail, top bar and inspector,
  and pages that use the screen's width (up to 2400 px).
- **Workspaces:** Home gives the live world most of the screen beside the project, its evidence-based status and its
  actions; Projects lists projects beside the selected one's timeline, sessions, validations, agents and configuration;
  the Visual Studio's world fills the main column, with an inspector grouped by creative purpose and Cancel and Apply
  pinned; the Music Studio brings the live monitor, the musical identity, the styles and the performance controls into
  one workspace; Visual Packs is a filtered library beside a pack inspector (identity, approval, parameters, files and
  digests); Connections and Settings put status beside guidance; Record & Broadcast shows a large recording preview;
  the Stage's navigation is clearer.
- **One recorder:** a window records only while it holds an exclusive Web Lock, so Record pressed in two windows at
  the same instant starts exactly one recording (20 of 20 rounds).
- **Auto quality** steps down within about 2 s of slow frames, straight to a usable level when they are far too slow,
  and climbs only after a stable period (longer after a failed attempt), using the GPU time where the browser reports
  it, without recompiling shaders. When no level draws smoothly it says so and offers Monolith; it never switches the
  world by itself.
- **Fixes:** no text under 12 px; toasts never cover a pinned inspector footer.
- **Screenshots** of every workspace at four desktop sizes, before and after (`docs/desktop/`).

### Flagship worlds (PR #8)

The three built-in living worlds rebuilt as flagship worlds, each a different universe with its own visual grammar.
Built on 0.5.0.

- **Fractal Biosphere:** a bioluminescent reef grown from the code. Recursive crowns (sea fans, pinnate fronds, polyp
  buds, photophores), species chosen from the project's data, blight on failing branches only, recovery that regrows
  them, phyllotactic milestone blooms that stay, rhizome cords between connected organisms, a sediment floor and
  migrating light shafts (`public/worlds/biosphere.js`, `biosphere-growth.js`, `biosphere-glsl.js`).
- **Stellar Forge:** a galaxy at scale with a bulge, dust lanes, grand-design spiral arms and nebulae; subsystems are
  beacons in its arms (a hard core, a diffraction cross, an emission knot sized by the subsystem); failure raises dark
  dust pillars around the strained systems, recovery dissolves them, milestones are novae whose remnant shells stay in
  the disc around their star.
- **Machine Cathedral:** needle spires on black water under a moon; windows light for live work, orreries turn,
  links are bridges of light, failure cracks the stone and darkens the windows from the top, recovery relights them,
  milestones gild the great spire and leave halo rings.
- **Cinematic grade options** for worlds and packs (`grade()`): AgX tone mapping, screen-space light shafts,
  anamorphic streaks and tinted halation; all off by default, so packs render exactly as before.
- **Generator v2:** Fractal Biosphere species come from the project's traits; Machine Cathedral gains light shafts and
  wetness from a separate random stream. Every value generated by v1 is unchanged.
- **Visual Studio:** each world says why to choose it; six curated looks (two per world, built in, read-only) preview
  and apply like presets; an Essentials group holds the few parameters that change a world the most.
- **Stage:** the Stage button shows the active world.
- **Fixes from review:** after a seek, the first event brings the world up to date at its time before its effect is
  placed (Replay from here on a marker showed a nova at the origin, or no sprout); a newborn organism's sprout now plays;
  Biosphere blooms are bounded (24 per organism, 400 in all); agent swarms and Stellar planets no longer depend on frame
  history; Stellar's galaxy survives a shader pack's background, and no light shafts point at a sky a pack replaced;
  Visual Studio controls start from what an older Cathedral recipe renders. `updateMs` counts afterCamera's offscreen
  passes as drawing, as `docs/packs/performance.md` defines it.
- **Qualification:** a render lab (`qualification/visual/lab.js`) for stills of a world on real project data at
  recorded moments; flagship screenshots (`qualification/ui/world-shots.js`, `docs/worlds/spectacle/`).

## 0.5.0 — the Creative Control Center (not released)

Code Resonance becomes an application: a Control Center to configure and operate it, and an immersive Performance
Stage, on the same engine and the same authoritative state. Built on 0.4.0 alpha 1; not stable, not released.

### The application

- **Workspaces:** Home (is it running, is capture really active, what needs attention, a resumable setup guide),
  Projects (browser, statistics, timeline with replay from any moment, agents, validations, exports), Visual Studio,
  Music Studio, Visual Packs, Connections, Record & Broadcast, Settings, and the **Performance Stage** (`#/stage`:
  controls fade, full screen, a second window for another monitor). Replaces the three-column player. The OBS view
  (`?overlay=1`) and existing bookmarks keep working.
- **One engine:** `public/app.js` exposes `window.ResonancePlayer`; the stage is placed over whichever view shows it
  (never a second renderer, scheduler or clock in a window) and pauses drawing while no view shows it.
- **Visual Studio:** choose → preview (never saved, shown in this window only) → customise → apply (checked against
  the recipe revision; a change made elsewhere meanwhile is reported). Parameters are generated from the parameter
  catalogue and from pack manifests (world-pack parameters, shader-pack uniforms), validated by the receiver;
  customising locks the identity; *Reset customisations* restores the generated values. Real thumbnails of the
  built-in families rendered from the project. Visual presets.
- **Music Studio:** style, tempo (the project's or manual), texture and volume per project or globally, heard live as a
  preview before applying; the project's musical identity (key, mode, tempo per style, motif); music presets. The WAV
  export now uses a manual tempo when one is chosen.
- **Visual Packs:** import from a `.zip` or a folder through the browser (quarantined, validated by the SDK's own
  checks, installed unapproved), review files and digest, approve, revoke, remove, read READMEs and the SDK guides.
- **Connections:** the receiver's health; per project, what VS Code capture was really observed and the capture
  settings the extension reported; Claude Code activity, and adding or removing its hooks after showing the exact change.
- **Record & Broadcast:** recording profiles (720p, 1080p, stage size), one recorder shared by every control and one
  recording at a time across windows, the OBS URL builder, exports.
- **Settings:** global preferences, this device's quality, where each kind of configuration lives, diagnostics.

### Receiver

- **Configuration authorities:** `settings.json` (global), per-project `preferences.json`, `presets.json`; versioned,
  validated, written atomically; field-level patches; `409` for a stale revision. The player's previous browser
  preferences move to the receiver once.
- **Change feed** (`GET /api/changes`, server-sent events): every window, the Stage and the OBS view converge.
- **Capture evidence** per project from the journal (`GET /api/evidence`).
- **Control capabilities and pairing:** administrative routes need a capability, issued only to a loopback request
  of the page's origin that presents the pairing key from `receiver-auth.json`, which a browser gets once through a
  single-use pairing link (`npm run pair`). Previously recipe edits
  and pack approvals needed only the page's Origin, which any local process can forge.
- **Recipes:** revisions, batches, previews, `tune` / `tune-reset`; a project's information mode follows the global
  setting until one is chosen for it (recipes from before 0.5 are read that way).
- **Packs:** `/api/packs/{import,install,discard,remove,readme,templates}`; a pack with problems cannot be approved;
  reserved ids (`trust.json`, Windows device names) are refused; the registry no longer answers for `constructor`.

### Extension 0.5.0

- Reports its capture settings at capture start and when they change (`workspace.settings`), values only.
- `vscode://zerobandwidth.code-resonance/settings` opens its settings; *Open Code Stage* opens a paired link.

### Qualification

- `qualification/ui/`: an isolated seeded environment (`serve.js`), one browser suite per workspace and a cross-view
  acceptance suite (first run, two projects and a receiver restart, recording across windows, OBS updates, previews
  that stay local, responsive layouts), run by `ui/run-all.js`; the existing harnesses drive the new Stage.

## 0.4.0 alpha 1 — controlled-alpha candidate (not released)

The first version meant for real developers on real projects, with the limitations in `docs/ALPHA.md`. Not stable,
not production-ready. Everything since 0.3.0:

### Alpha candidate: memory, synchronisation, recording sizes

- **Recording size:** choose 720p (1280×720, the default), 1080p (1920×1080) or the stage's size next to ● RECORD. At
  720p and 1080p the world renders at exactly that size with a 16:9 camera (packs too), so the file has those encoded
  dimensions with nothing stretched or cut; the stage shows the same picture letterboxed while recording. Video bitrate
  5 Mbit/s at 720p, 8 at 1080p. A recording that cannot keep up (under 28 frames drawn per second for ten seconds) is
  reported once, with advice. 720p is the default because it holds 30 fps on modest GPUs.
- **Memory leak fixed:** the recording's sound watchdog created an audio source node per recording that the browser
  never released (about 2-3 MB per recording in the renderer and the GPU process); it now uses one for the page.
  A finished recording is no longer held in memory for a minute after it is saved. A disposed world releases its GPU
  context at once; the pack worker reuses its compositing canvas.
- **Synchronisation fix:** in replay, sound was scheduled from the playhead of the last animation frame, so a cue
  scheduled after a main-thread stall sounded that much late (+136 to +166 ms after a 150 ms stall, reproduced); the
  playhead is now extrapolated between frames.
- **Qualification:** renderer memory forensics with a lean browser driver (Playwright's DevTools connection keeps every
  fetched response in the renderer, which had made the soak's memory unreadable), in-player bisection, blank-page
  isolation of the recorder and of worker/WebGL lifecycles; synchronisation markers v2 (a green flash and a 3-6 kHz
  chirp found by a matched filter, offsets as frame-bounded intervals, a self-test with distractors) and a matrix of
  conditions (worlds, sizes, quality, switching, CPU load, live, stalls); recording sizes measured from the files.
- **Version 0.4.0** for the first controlled alpha (`docs/ALPHA.md`).

### Product hardening: recording, bounded pack runtime, qualification

- **Live recording for every world:** ● RECORD records the presented stage (built-in worlds, declarative, shader and world
  packs) with the music through one player-owned compositor canvas and the music's own output stream; packs composite
  their frame and labels in their worker. Restart-safe (each recording clones the audio track), finishes and saves when
  a pack is stopped, explains when the browser cannot record, shows elapsed time and *NO SOUND*.
- **Visual Pack SDK 1.1:** pack code runs in a dedicated worker inside the isolated frame (a hang no longer blocks the
  player; no DOM, no navigation, no WebRTC for pack code); `sdk.util.canvas`. 1.0 packs run unchanged
  (`docs/packs/migration.md`).
- **Bounded delivery and a watchdog:** acknowledged renders, at most one in flight, skipped presentation frames counted,
  semantic messages never dropped (counted on both sides), exact film frames or an explicit error; packs are stopped on
  no answer (6 s), under 1 fps, exceptions, GPU context loss, message floods, navigation, revocation or modified files,
  with the reason shown, the built-in identity shown instead, the recipe kept, and RETRY (no automatic restarts).
- **Integrity:** the player verifies every pack file's SHA-256 and the digest before running it; the receiver notices
  files changed after installation while it runs; the pack frame's policy carries its own sandbox; frame bitmaps are
  size-bounded.
- **Quality control:** World DNA → Quality (Auto, High, Medium, Low, Lowest); a notice when a pack exceeds its declared
  budget.
- **Testing fixtures** (`packs/testing/`, not packs): slow, failing, hanging, context-loss and hostile-probe worlds.
- **Qualification:** recording (`visual/recording.qual.js`, measured from the WebM files with ffmpeg: streams, frame
  timing, sound continuity, flash/click synchronisation), runtime robustness (`visual/robustness.qual.js`), multi-hour
  soak (`visual/soak.qual.js`), OBS Studio in a disposable CI machine (`obs/obs.qual.js`), platform smoke test
  (`platform/smoke.js`), unit-suite stress runner (`unit-stress.js`). CI: reference packs, runtime and native Windows in
  the required tier; an extended tier by label.
- **First run:** `npm run doctor`, `docs/FIRST-RUN.md` (with troubleshooting), `docs/WSL.md`, `docs/OBS.md`.
- **Recording and lost sound:** an audio device that disconnects or stalls stops the music's audio clock, and the
  browser's recorder then stalls the whole file (its WebM muxer waits for sound). The recorder watches its sound (track
  ended or muted, audio clock stopped, digital silence while the music plays) and then finishes and saves the recording
  at once, with the reason.
- **Fixes:** a receiver restart stopped a running pack ("removed") and, rebuilding the world while the receiver was
  down, the player gave up the living world for the Construct for good (network failures now retry); turning sound off
  while recording threw (a removed variable); a recording started during a world switch could take a hidden canvas's
  size (320×180); a pack's stop reason was lost when the identity without it loaded; the mood was posted to packs every
  frame (now on change); the two intermittent `npm test` failures (a planted secret colliding with random hex ids;
  cleanup hooks removing a receiver's directory before stopping it).

### Visual Pack SDK 1, long histories, privacy

- **Visual packs** change how a project looks without changing Code Resonance: declarative (data only), shader (GLSL
  background and post passes) and world (a complete world family). A JSON schema shared by editors and the receiver,
  parameter catalogues with effect polarity (a failure can never be shown as a success), installation with per-file
  hashes and a digest, approvals bound to that digest, tamper detection; `scripts/pack.js` (new, validate, install,
  list, approve, revoke, remove, test, catalogue). Packs with code run in an isolated frame with no network, never in
  the player's origin; the player's REVIEW dialog shows author, files, digest and the isolation limits.
- **Reference packs** written from the documentation only: Cymatic Field (a fourth world family), Blueprint Cathedral
  (shader), Ember Observatory (declarative); starter templates; SDK documentation in `docs/packs/`.
- **Long histories:** exact replay of histories up to 1,000,000 intents with bounded, checkpointed state (early
  milestones, agent numbers and departed sessions were lost before).
- **Privacy:** the Stage never shows the project's folder name; public titles come only from a title the user sets.

### Living worlds (artistic candidates)

- **Visual Recipe (World DNA):** a persistent, versioned artistic identity per project, generated from the project's
  founding traits; keep it, regenerate it, choose another family, lock it.
- **Living-world engine** (WebGL2, HDR pipeline) with three families: Stellar Forge, Fractal Biosphere, Machine
  Cathedral. Interpretation v7: canonical performance intents, agent lifecycles, language adapters (TypeScript, Python,
  manifests). A director maps intents to effects in proportion to evidence; labels in cinematic, explorer, stream and
  off modes; adaptive quality; deterministic films; live priming with the session's history.
- **Music:** lighter low end, wider stereo, evolving pads, relaxing when the work goes quiet (same loudness).

### The Construct (candidate for visual review)

- Interpretation v5/v6: architectural districts from folder structure, a persisted site plan (nothing ever moves), stable storey order per file, building states (draft, committed, validated, stressed) localized to the files a test run or commit covers, rename-preserving identities, location on cues, salted public ids.
- The Construct: an illuminated architectural model built as the work happens (docs/CONSTRUCT.md), WebGL with a Canvas2D fallback, captions for viewers who do not code, deterministic film rendering with music.
- A real recorded project (`qualification/recordings/lumen-recipes`): editor typing and six Claude Code agents building an app, with a failing test run, recovery, integration and commits.
- Construct at scale: level of detail, quieter conduits in dense districts, merged settled conduits (450 files: 6,017 → 3,622 draw calls), and a camera that frames the site's actual outline. GPU measurements under WSL2 (`CR_QUAL_GPU=wsl`).

## 0.3.0 — Qualified capture, meaningful interpretation, a composed performance

Audit findings and evidence: `docs/AUDIT.md`. What was verified, and where: `docs/QUALIFICATION.md`.

- **Privacy:** typed text is no longer captured or stored (it was, even with content capture off); per-second edit counts instead. Command lines are classified locally into categories. `resonance.includeHidden` now works.
- **Reliability:** a rejected event can no longer stall capture; valid events in a batch are kept; outbox flushes on close, waits for a receiver before indexing, and has a disk budget; torn journal lines are repaired.
- **Interpretation (v4):** stable symbol keys (no line-number churn); credit by meaning, saturating for bulk; validated refactors and recovered tests are milestones; tension from current state; terminal and agent test runs count; commit vs. checkout distinguished; recalibrated chapters.
- **Recorded performance:** deterministic windows from `receivedAt`, append-only `performance.jsonl` with graph deltas, full-history replay, automatic rebuild when the interpretation changes, cached views (3 ms vs 308 ms on a real project), ~10.5 s performance delay.
- **Agents:** Claude Code hook adapter (`npm run hooks:claude`); correlated attribution; distinct voices; project ids that match VS Code exactly.
- **Music:** composition v2 (identity, sections, call and response, motif development, tension/resolution, event figures) and a mixed, quantized performer with offline rendering.
- **Player:** one performance clock for sound and image; growing layouts; pulses at the module that changed; beat- and section-aware worlds; OBS `?overlay=1&sound=1&project=`; WAV export; project names in the selector.
- **Extension UX:** status-bar menu (start/stop, Stage, OBS view, prompt).
- **Build:** VSIX packaged with Node only (no bash/zip). Qualification harnesses for VS Code, Chromium, audio and a 30-minute real-code session.

## 0.2.0 — Standalone Code Resonance

- Removed Signal/3 naming and integration dependency. New versioned independent performance interface.
- Introduced independent deterministic musical score and real Web Audio sequencer with Ambient, Pulse, Cinematic, and Chip palettes; bar-quantized frame transitions and adjustable musical controls.
- Added Nexus, Monolith (isometric architecture), and Nebula worlds driven by the same anonymized project model.
- Added browser WebM performance recording, clean OBS overlay and persisted player settings.
- Kept the original local-first VS Code capture, durable outbox, semantic sorter, agent hook, event journal and replay.
- Added pure score tests, browser smoke verification workflow, private publishing instructions and revised security documentation.

## 0.1.0 — Code Instrument prototype

- Loopback receiver, local semantic event interpretation, Canvas2D audition, snapshot replay and extension capture.

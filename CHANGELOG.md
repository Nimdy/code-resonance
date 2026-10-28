# Changelog

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

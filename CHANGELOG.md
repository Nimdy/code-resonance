# Changelog

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

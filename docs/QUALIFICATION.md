# Qualification — what was verified, where, and what was not

All results below come from runs in this repository's `qualification/` harnesses (raw JSON in
`qualification/results/`). Environment: Ubuntu 24.04 on WSL2 (Linux 6.6), Node 22.22, 24 cores, Xvfb; VS Code 1.143.1
(downloaded test instance with isolated profile); Chromium from Playwright 1.62 (headless, software rendering).

**Also on GitHub's runners (native Ubuntu):** the `qualification` workflow passed on PR #1. The VS Code job passed
every check except the real-agent check, which is skipped in CI by design and reported as unverified; it also passed
restart resume. The browser job passed every Stage check and the 60-second audio render.

## How to run

```bash
cd qualification && npm ci
npx playwright-core install chromium                  # once, if not cached
xvfb-run -a node vscode/run.js                        # real VS Code extension host (+ CR_QUAL_AGENT=claude for a real agent)
CR_QUAL_EXTENSION_REF=<git ref> xvfb-run -a node vscode/run.js   # qualify the extension as of any commit
node browser/stage.qual.js [path-to-a-real-repo]      # Stage in Chromium
node browser/audio.qual.js                            # offline renders, loudness metrics, WAV excerpts
node browser/soak.qual.js                             # long live playback (CR_SOAK_MINUTES)
node session/history-session.js <repo> /tmp/cr-session 120 30   # build a 30-minute real-code session
node session/session.qual.js /tmp/cr-session <projectId>          # render and analyse it
node visual/datasets.js results/datasets --excalidraw <repo> --self <repo> --long 300   # datasets for the visual checks
node visual/worlds.qual.js [--gpu amd] [--only determinism,idle,live,performance]
node visual/history.qual.js                           # long histories, synthetic, up to 1,000,000 intents
node visual/long.qual.js                              # long-history replay in the player (lumen-long fixture)
node visual/unchanged.qual.js [--baseline <ref>]      # built-in worlds render the same frames as a baseline commit
node visual/pack.qual.js <pack dir> [--gpu amd]       # visual pack compatibility (= node scripts/pack.js test)
node visual/catalogue.qual.js                         # every family at the extremes of its parameter catalogue
node visual/recording.qual.js [--gpu amd] [--quick] [--pack <dir>]   # live recording of every renderer category, measured from the files
node visual/robustness.qual.js [--gpu amd] [--quick]  # pack runtime: slow, hanging, failing, context-loss, hostile fixtures
node visual/soak.qual.js --hours 3 [--gpu amd]        # hours of live playback with packs, idle, recordings, a receiver restart
node visual/sync.qual.js [--gpu amd]                  # recording synchronisation per condition (worlds, sizes, load, switching, live)
node visual/memory.qual.js [--gpu amd] [--gc-each] [--experiments ...]   # renderer memory forensics (lean driver: no DevTools Network)
node visual/memory-detached.qual.js [--gpu amd]       # control: the same session with and without a DevTools Network client
node visual/memory-recorder.qual.js / memory-lifecycle.qual.js   # browser behaviour isolated on a blank page (recorder; workers, WebGL)
xvfb-run -a node obs/obs.qual.js                      # OBS Studio itself: only in a disposable machine (CI), never on a workstation
node platform/smoke.js                                # the product as processes: receiver, token, restart, pack CLI, integrity
node unit-stress.js --runs 30 [--load 48] [--io 4]    # npm test repeated, optionally under CPU and disk load, full TAP kept
node ui/serve.js [--port 4180] [--empty]              # an isolated installation to review the Control Center (prints a pairing link)
node ui/run-all.js [--jobs 3] [--only home,visual] [--quick]   # the interface: every workspace's suite + the acceptance suite
node ui/acceptance.qual.js [--quick]                  # cross-view acceptance (first run, pairing, projects, OBS, recording, layouts)
node ui/screenshots.js [--gpu amd]                    # review screenshots into docs/control-center/
```

**Test categories.** *Unit and integration* (`npm test`, no dependencies, every push, Linux and native Windows):
modules and the receiver's HTTP API in-process. *Platform smoke* (`platform/smoke.js`, every push, both platforms): the
product as real processes. *Browser qualification* (headless Chromium, software rendering): the Stage, audio, visual
pack compatibility (each reference pack), the pack runtime's robustness, live recording; quick variants on every pull
request, full variants in the extended tier. *Extension host* (real VS Code under Xvfb): every pull request on Linux,
extended tier on native Windows. *Long-running* (soak, long history, 3-minute recording): extended tier. *OBS*: extended
tier, in the disposable runner. *Local GPU runs* (`--gpu amd`): the AMD integrated GPU of the development machine, by
hand. The extended tier runs when a pull request carries the label `extended-qualification` (or `extended:<job>` for one
job, to re-run it after a fix), weekly on main, or by hand on main; it costs about four runner-hours, which is why it is
not on every push.

The real-agent scenario uses your Claude Code login and is capped with `--max-budget-usd 0.50`.

## VS Code extension host (real)

40/40 checks pass for the current extension (`results/vscode-qualification.json`):

| Area | Verified |
|---|---|
| Install | Packaged VSIX installs through the VS Code CLI (`zerobandwidth.code-resonance`) |
| Consent and baseline | Modal consent once; baseline indexed and not credited as new work |
| Human editing (real keystrokes via the `type` command) | Component, function, import and module-level variable classified; local variable recorded but not credited |
| Files written outside the editor | Observed by the file watcher, classified, attributed `unknown` |
| VS Code file operations | Create, rename, delete |
| Tasks | `npm test` task exit codes 0 then 1 → test passed / failed |
| Terminal (shell integration) | Start/finish with exit code; command text not recorded; `npm test` recognised as a test run |
| Diagnostics | TypeScript errors recorded per file |
| Git | Command-line commit observed with matching hash |
| Real AI agent | Claude Code (Haiku, 9 turns, $0.044): hook events joined the same project; prompt text not persisted; agent-written file observed independently by the extension and attributed to the agent by correlation; the agent's `npm test` counted as a validation (exit 0) |
| Receiver outage | Events queue on disk, drain after restart, nothing lost; per-session order preserved; no duplicates |
| Privacy | Typed text never in the journal (also with content capture off); public endpoints contain no typed text or paths |
| Restart | Capture resumes after a normal VS Code restart without a prompt (see note) |
| Project identity | Hook project ids equal `vscode.Uri.file(root).toString()` hashes for tricky paths |

**Note on restart.** VS Code keeps workspace storage in memory while extension tests run, so persistence cannot be
observed from a test run. The resume check seeds the extension's persisted flag into the real `state.vscdb` and
launches VS Code normally.

**v0.2.0 extension, same suite** (`results/vscode-qualification-v0.2.0-baseline.json`, against the current receiver):
31 pass; terminal `npm test` is not recognised as a test run; no agent integration. The journal for the identical
scripted session was 717 events / 274 KB (v0.2.0) versus 103 events / 38 KB.

**Editor overhead.** Keystroke latency, extension-host event-loop delay and CPU per keystroke were measured with
capture off and on in each run. Differences were below run-to-run noise (CPU per keystroke 0.96–1.35 ms with capture
off across runs; p99 keystroke latency 6–15 ms). The harness types as fast as the editor accepts, so this is a stress
measurement, not typical typing.

## Receiver and interpretation (real code)

Excalidraw (448 files, simulated hour of 300 edits): `GET /api/project` 3 ms (v0.2.0: 308 ms), sort per window 61 ms
(695 ms), `state.json` 7.6 MB (39.8 MB), RSS 312 MB (1007 MB); 300 created symbols for 300 added functions (12,850).

Event → recorded timeline latency (20 events, random window offsets): median 5.1 s, p90 6.3 s, max 6.4 s.

## Browser (Chromium, headless, software rendering)

`results/browser/stage-qualification.json`: 14/14 checks: live view, measured audio output (no clipping), replay
of the full timeline, scrubbing changes the architecture, playback advances, WebM recording with audio (2.6 MB in
4 s), WAV export (a valid RIFF/WAVE file), OBS overlay hides controls and fills 1920×1080, no file paths in the page,
no page errors. Frame rate at 1920×1080 with 1400 nodes (Excalidraw): Nexus 60, Monolith 60, Nebula 39 fps.

## Audio

`results/audio/audio-qualification.json`: a scripted 3-minute performance (chapters 1→5, a failing test and its fix,
two agents, a commit) rendered offline in every palette. All four pass: no clipping (peaks 0.27–0.30), levels
−22.1 to −23.5 dBFS (palettes within 1.4 dB of each other), loudness range 3.8–8.3 dB, no dropouts after the
lead-in to the first downbeat, and the tension episode is 1.2–1.9 dB fuller than the passage before it. Listening
excerpts: `results/audio/*.wav` (not committed).

## 30-minute real-code session

`results/session/session-qualification.json`: Excalidraw's first 120 commits (1–5 January 2020, the app being
built from scratch) replayed as a 30-minute session through the real receiver and worker, then rendered.
Timing is planned and compressed; the code changes are real; there are no test runs or agents in that history.

- Interpretation: 537 events, 222 recorded windows; chapter every 3 minutes: 1 2 2 3 3 3 3 3 4 4 4.
- Ambient, final code, all 30 minutes: no clipping (peak ≤ 0.31), −23.7 to −21.5 dBFS per 5-minute block, **no silent
  windows**; sections home 322 bars, away 149, breath 104, lift 40 (lifts follow the most substantial commits);
  the number of distinct layer combinations rises from 2 to 4 per block as the chapters advance.
- Pulse and Cinematic, from a run before the melody-register change: −24.5 to −22.6 dBFS, peak ≤ 0.28, no silent
  windows except one 3-second window in Cinematic's first block (consistent with the lead-in at session start; its
  position was not recorded). Chip was not completed in that run.
- The first render of this session found the offline voice-budget bug (pads silently dropped); it was fixed and the
  session re-rendered.
- Contact sheet of the Stage across the session: `results/session/contact-sheet-nexus.png` (not committed). The
  structure grows from one module cluster to dependency-linked modules; after the replay birth-order fix the layout is
  stable across seeks. A file rename appeared as a module moving, because it got a new identity (before
  interpretation v6).

## Soak

`results/browser/soak-qualification.json`: 30 minutes of live Stage with sound, rotating worlds, while a session
streamed ~1300 events and grew to 88 modules. Frame rate 60.1–60.4 fps throughout; audio never silent at any sample;
no page errors; JS heap followed a garbage-collection sawtooth between 2.4 and 26.5 MB and ended at 10.3 MB; DOM nodes
539–891 and event listeners 36–69 without monotonic growth; receiver memory 176 → ~200 MB and then flat.

## The Construct (candidate visual world)

Technical results only; whether it is good to watch is a human judgement that has not been made yet.

- **Real recording:** `qualification/recordings/lumen-recipes` (committed; journal, blobs, id and salt only), made
  with `CR_QUAL_SCENARIO=construct` in VS Code 1.143: editor typing plus six Claude Code (Haiku) agents building a
  recipe app. 230 events, 17 files, 164 agent events, 54 cues attributed to an agent by its own hook event, 1 failing
  and 4 passing test runs, 2 dependencies between districts, 2 commits, $0.51 of agent usage
  (`results/construct-recording.json`). The refactor step removed one symbol, below the refactor-milestone threshold,
  so the milestone path is not shown in this recording.
- **Film:** `visual/film.js` renders the recording frame by frame at exact performance times with the offline-rendered
  music: `results/visual/construct-lumen-recipes.webm` (VP9 1920×1080 30 fps + Opus; not committed, too large for
  git). Representative frames are committed in `docs/construct/`.
- **Determinism:** stills rendered twice for the same moment from the committed fixture are byte-identical, and
  identical to stills from the original export.
- **Scale** (`visual/construct.qual.js`, Excalidraw, first 450 files: 450 buildings, 3,185 symbols, 939 storeys
  drawn, 11 districts, 1,008 conduits): 3,622 draw calls, 300k triangles at full quality.
  Frame rate in headless Chromium at 1920×1080, each run measured over 5 s (the JSON files keep the last run):

  | Renderer | Sample app (10 files) | Excalidraw (450 files) |
  |---|---|---|
  | AMD Radeon integrated GPU, WSL2 (ANGLE GL → Mesa d3d12) | 60.1 fps | 31–48 fps (5 runs) |
  | NVIDIA RTX 5090, same path | 60.1 fps | 18–39 fps (4 runs) |
  | SwiftShader (CPU) | 33.1 fps | 4.1 fps |

  Scene update takes about 1.5 ms; the rest is submitting 3,622 draw calls through the WSL translation layer
  (19–35 ms, varying from run to run), which is why the faster GPU does not score higher. Before level of detail and
  merged conduits it was 6,017 draw calls and 26–28 fps with shadows already switched off by adaptive quality. Native
  browsers (Windows ANGLE D3D11, macOS Metal) were not measured.
- **Privacy:** no file paths in the page (a real path from the sample is checked), no page errors.

## Living worlds (Phase 3, artistic candidates)

Technical results only; artistic acceptance is a human judgement that has not been made. Datasets are built by
`visual/datasets.js`: the committed Lumen Recipes recording; a **supplemental** copy of it with a 100 s pause inserted
after the first commit (real events, timestamps after the pause shifted; labelled in its README, its project name and
on every frame of its film); the first 450 source files of an Excalidraw checkout indexed as an existing project; and
Code Resonance's own first-parent git history (38 commits) replayed as a 20-minute session.

- **Identities** (`visual/recipes.js`, pinned in `docs/worlds/recipes/`): Lumen Recipes generates Stellar Forge
  (scores 1.74 / 1.55 / 0.43 for Stellar / Biosphere / Cathedral), Code Resonance generates Machine Cathedral
  (0.97 / 0.78 / 1.14), Excalidraw generates Machine Cathedral by a narrow margin (1.28 / 1.49 / 1.52, decided by the
  seeded share); for the comparison Excalidraw is also shown with Fractal Biosphere chosen by hand (`source: "user"`).
- **Draw calls** (scene pass): Stellar Forge 13, Fractal Biosphere 7, Machine Cathedral 8 on the 450-file Excalidraw
  snapshot (the Construct: 3,622). The full frame adds the background, bloom chain and grade (21-27 passes).
- **Frame rate**, live player, 1920×1080, Excalidraw 450 files, 8 s after settling (`visual/worlds.qual.js`):

  | Renderer | Stellar Forge | Fractal Biosphere | Machine Cathedral |
  |---|---|---|---|
  | AMD Radeon integrated GPU, WSL2 (ANGLE GL → Mesa d3d12), full quality | 28.1 fps | 25.5 fps (27.3 adaptive) | 34.5 fps |
  | SwiftShader (CPU), full quality | 2.3 fps | 2.2 fps | 2.2 fps |

  Scene update is 0.2-0.6 ms and command submission 0.3-0.4 ms per frame; the remaining time is GPU fill (HDR,
  4× MSAA, bloom, full-screen sky). Live playback lowers MSAA and resolution when frames are slow (films never do).
  The RTX 5090 was not used. Native browsers (Windows ANGLE D3D11, macOS Metal) were not measured. Re-measured in
  Phase 4 with GPU time (same setup, `results/visual/worlds-qualification-amd.json` now holds that run): 25.8 / 24.8 /
  41 fps, see "Visual packs" below.
- **Film rendering** is frame-exact and independent of machine speed: about 0.27 s per 1080p frame on SwiftShader.
- **Determinism:** the same recording, recipe and moment render byte-identical frames in two browser sessions, also
  when one session first played another moment (Lumen / Stellar Forge, Excalidraw / Biosphere, Code Resonance /
  Cathedral).
- **Idle life** (Stellar Forge): between samples taken 10, 40, 70 and 100 s after the last Lumen event the mean
  absolute luminance change is 26.8, 25.5 and 28.7 (0-255), while the structure (17 planets, 31 moons, 12 links,
  6 systems) and the 205 recorded intents stay exactly the same; the director reports idle from the 40 s sample on.
  The idle check runs on Stellar Forge only; the other families' idle motion is visible in the films, not measured.
- **Resources:** switching the recipe 9 times through the three families (Stellar → Biosphere → Cathedral, three
  rounds) brings Stellar Forge back to 20 geometries and 13 textures, the same as on its first build.
- **Privacy:** 61 distinct label strings, collected every 3 s through the whole Lumen session in cinematic mode and for
  10 s in stream mode, contain no path, file name (with or without extension), distinctive folder name or camelCase /
  snake_case identifier (41 patterns from the recording's real files). An earlier version of this check matched path
  segments as substrings and flagged "Agent 5 · searching" (search.js) and "Integration validated" (validate.js); it
  now matches whole words, and deliberate leaks such as "RecipeCard", "models.js" or "src/data/store.js" are caught.
- **Films against the PR #2 baseline** (`construct-lumen-recipes.webm` vs `living-lumen-recipes.webm`, both decoded to
  320×180 grey at 10 fps; "lit" = more than 25 levels above the frame's median, "changing" = more than 6 levels between
  frames 0.1 s apart): lit pixels 13.9 % → 25.9 % (median), pixels changing per 0.1 s 2.33 % → 6.06 % (median) and
  7.29 % → 24.84 % (p90); in the quiet 60-70 s window 0.34 % → 1.11 %; in the 90 s idle tail after the session 3.07 %.
  These say the new film is brighter, fuller and more animated, not that it is better art.
- **Film audio** (same films, ffmpeg ebur128): the Lumen session -23.9 LUFS integrated, the idle tail -24.2 LUFS with no
  silent stretch.
- **Live priming:** opening the live view (not a replay) on Lumen Recipes primes the director with 205 of 205 recorded
  intents, read through the timeline's intents view (`/api/timeline?fields=intents`) without a page limit. The
  previous client read at most 10,000 windows from the start; no recording that long was available, so the
  difference itself is covered by a unit test of the intents view, not by a long live session.
- **Agents in Lumen Recipes:** 142 lifecycle intents from 6 agents; each presence appears with its session, follows
  its tool activity (reading, searching, editing, running, testing) and departs when its session ends.
- **Music balance** (`audio/balance.js`, the real Lumen timeline through the PR #2 and the current `music.js`):
  integrated loudness -23.1 → -23.5 LUFS, true peak -12.1 → -11.1 dBFS, energy below 120 Hz -1.5 dB relative,
  above 200 Hz +4.2 dB, above 2 kHz +10 dB, stereo phase correlation 0.79 → 0.52. Not yet reviewed by ear.

## Privacy repair (Phase 4)

PR #3's host used the project folder name as the fallback title card and stream lower third. Labels are now composed by
`public/worlds/labels.js` from generic words, generated names, aliases and the recipe's **public title**, which exists
only when the user sets it. On Lumen Recipes the title card reads "Stellar Forge" and the lower third "Code Resonance ·
Stellar Forge" (before: "lumen-recipes", "lumen-recipes · Stellar Forge"). Regression tests plant a folder name and
check every label mode (`tests/privacy-labels.test.js`); the browser privacy check now also forbids the folder name and
passes on 61 label strings.

## Long histories (Phase 4)

`public/worlds/history.js` keeps the director and agent presences exact with bounded memory (see `docs/WORLDS.md`).

- **What PR #3 lost** (`visual/history.qual.js`, PR #3's modules extracted from git, synthetic histories in two profiles;
  `results/visual/history-qualification.json`): at the end of a history, after a seek or recipe switch.

  | Intents | Profile | PR #3 ambient unlocks | PR #3 lasting blooms | Agent labels |
  |---|---|---|---|---|
  | 30,000 | active | 4 of 4 | 1 of 46 | differ |
  | 100,000 | mature (milestones only early) | 0 of 4 | 0 of 12 | differ |
  | 300,000 | mature | 0 of 4 | 0 of 46 | differ |
  | 1,000,000 | active | 4 of 4 | 2 of 1,489 | differ |
  | 1,000,000 | mature | 0 of 4 | 0 of 151 | differ |

  Blooms were lost even below 30,000 intents (they were rebuilt from the director's last 400 commands); agent labels
  differed because crashed sessions stayed "status unknown" forever and agents were renumbered.
- **Checkpointed history, same histories:** equal to a plain fold of every intent at the end and after seeks to 99.95 %,
  99.5 %, 50 %, 2 % and back to 99.9 % of the history, at every size (late arrivals ~2.5 %); at most 30,000 raw intents
  and 35-40 checkpoints held (about 7-10 MB serialized whatever the length); 14-27 µs per streamed intent including
  exact re-folds for late ones; seeks 2-71 ms, and 216-265 ms for the far seek forward after a rewind at 1,000,000
  intents (a parked checkpoint whose sequence fingerprint matches is reused). Tests show each check failing against a
  deliberately broken version first (`tests/history.test.js`).
- **In the player** (`visual/long.qual.js`, SUPPLEMENTAL `lumen-long` fixture: the real Lumen events repeated as 300
  sessions an hour apart with fresh ids, 12,796 windows, 49,546 intents, 1,800 agent sessions, the only two verified
  milestones in the first session; 9/9): PR #3 would show 0 of 2 unlocks and 0 of 2 blooms at the end; the player after a
  seek into the last quiet hour folds exactly the 49,381 intents before it (2 unlocks, 2 lasting blooms, 163 crown
  instances) with 21,381 raw intents held; after a minute of playback inside the last session it matches the fold,
  agent numbered 1798; the same moment renders the same frame with a different seek history; the live view primes all
  49,546 intents in 4.4-5.1 s. Replay opens in 1.4 s, seeks take 26-115 ms, the page heap is 73 MB.
- **Nothing visible changed:** `visual/unchanged.qual.js` renders 11 moments of the three families (Lumen as Stellar
  Forge and as Fractal Biosphere, Excalidraw as Biosphere, Code Resonance as Machine Cathedral) with PR #3 (a7c8cfe, in a
  temporary worktree) and with this branch, labels off: all 11 frames byte-identical.

## Visual packs (Phase 4, artistic candidates)

The SDK's compatibility harness (`visual/pack.qual.js`, `results/visual/pack-<id>.json`) on the three reference packs,
SwiftShader, Lumen Recipes for the session checks, Code Resonance's history for the second recipe, the 450-file
Excalidraw snapshot for performance:

| Check | Cymatic Field (world) | Blueprint Cathedral (shader) | Ember Observatory (declarative) |
|---|---|---|---|
| Runs | isolated frame | isolated frame | in the built-in world |
| Isolation probes (fetch, XHR, WebSocket, beacon, image, prefetch, import, worker, popup, WebRTC, storage, cookies, parent) | all blocked, outside listener received nothing | all blocked, nothing received | n/a (no code) |
| Self-navigation | player stopped the pack | player stopped the pack | n/a |
| Effects expressed during the session | 11 kinds (dissonance ×1, resonance ×2, …) | 11 kinds (stress-fracture ×1, illumination ×2, …) | 10 kinds (remapped aurora ×2, calm pulse ×4) |
| Labels (privacy) | 38 strings, no leak | 40 strings, no leak | 39 strings, no leak |
| Idle 10-100 s (mean \|Δluma\|) | 2.65, 2.11, 16.53 | 26.4, 49.65, 50.63 | 23.47, 24.18, 35.12 |
| Same moment on / off the beat (mean \|Δluma\|) | 1.59 | 2.06 | 0.22 |
| Determinism with another seek history | identical | identical | identical |
| Four switches away and back | 1 frame each time; geometries 13→13, textures 13→13, heap 21→21 MB | 1 frame each time; geometries 16→16, textures 14→14, heap 13→13 MB | geometries 20→20, heap 15→15 MB |
| Scene draw calls / all passes, 450 files | 7 / 21 | 8 / 23 | 13 / 27 |
| Triangles / points | 15,364 / 71,897 | 85,158 / 5,403 | 308,000 / 23,431 |
| Per-project recipe (Lumen / Code Resonance) | baseOrder 2 / 4, morphBars 16 / 32, … | uGrid 23.7 / 35.5 | base family's genome |
| SwiftShader fps (full / adaptive) | 2.0 / 2.2 (while a film rendered on the same machine) | 1.5 / 1.5 | 2.0 / 2.0 |
| Result | 21/21 | 20/20 | 17/17 |

**Total rendering cost on the AMD integrated GPU** (ANGLE → D3D12 under WSL2, live player 1920×1080, 450-file
Excalidraw snapshot; GPU time from `EXT_disjoint_timer_query_webgl2`, a moving average over the whole frame: background,
scene, post, bloom, grade; the pack frame counts its own frames). Cymatic Field passes its whole compatibility suite on
this GPU too (21/21, `results/visual/pack-halcyon.cymatic-field-amd.json`).

| World | fps full quality | fps adaptive | GPU time per frame | Scene draws / all passes | Triangles / points | CPU update |
|---|---|---|---|---|---|---|
| Stellar Forge (built-in) | 25.8 | 36.3 (level 1) | 37.7 ms | 13 / 27 | 308,000 / 23,568 | 0.28 ms |
| Fractal Biosphere (built-in) | 24.8 | 26.9 (level 1) | 39.17 ms | 7 / 21 | 90,984 / 7,326 | 0.27 ms |
| Machine Cathedral (built-in) | 41 | 41 (level 0) | 22.9 ms | 8 / 22 | 85,158 / 5,403 | 0.46 ms |
| Cymatic Field (world pack, in the isolated frame) | 60 | 60 (level 0) | 13.68 ms | 7 / 21 | 15,364 / 71,897 | 0.12 ms |

SwiftShader exposes no GPU timer (GPU time is reported as null there). The RTX 5090 was not used.

- **Starter template:** `packs/template/world`, as `scripts/pack.js new` copies it, passes the same suite unchanged
  (21/21, SwiftShader).
- **Films** (local, `qualification/results/visual/`, frames in `docs/packs/images/`): `pack-cymatic-lumen.webm` (5:40,
  the Lumen session and 100 s after it) and `pack-cymatic-self.webm` (2:31, Code Resonance's history at 8×), plus stills
  of Blueprint Cathedral and Ember Observatory. Rendered frame-exact on the AMD integrated GPU (10.3 and 4.5 minutes):
  this world's sand is computed per vertex every frame, and two parallel SwiftShader renders ran at about 3 s per frame,
  so they were stopped. Byte-identical determinism was checked on SwiftShader (above), not for these GPU renders.
- **Catalogue extremes** (`visual/catalogue.qual.js`): each family with every catalogue parameter at its minimum and
  at its maximum renders without errors (mean luma 58.8-62.3 at the minimum, 153.4-162 at the maximum): 6/6.
- **Unit and HTTP tests:** schema, semantic and static checks, compatibility, installation, approval, tamper detection,
  removal, recipes with packs and fallbacks, catalogue coverage, the privacy view with planted secrets, the frame's
  content policy and the opaque-origin rules.
- The Cymatic Field idle motion is gentler than the built-in worlds (the figures morph over 8-32 bars) and its beat
  response is subtle; Ember Observatory's beat response (Stellar Forge's) is the weakest that passes. Artistic
  acceptance of all three packs is a human judgement that has not been made.

## Product hardening: recording, bounded pack runtime, platforms

Raw results: `qualification/results/recording/`, `results/robustness/`, `results/unit-stress/`, `results/platform/`,
`results/soak/`, `results/obs/` (WebM files are kept locally, not in git).

### Live recording (● RECORD)

`visual/recording.qual.js` on the AMD integrated GPU (ANGLE → D3D12 under WSL2), the player at 1280×720 replaying the
Lumen Recipes recording at 4×, 20 s per world with a flash/click marker every 5 s, the file downloaded as a user gets it
and measured with ffmpeg. Audio continuity is measured with a 12 kHz pilot tone fed into the recorded output (`?qual=1`
only): a gap in the pilot is a dropout, whatever the music is doing. 64/64 checks (final code, Chromium's own audio
output; GPU time from the world's timer query).

| World | Video | fps (frame interval median / p95 / max) | Gaps > 250 ms | Pilot gaps | Marker offsets, sound − picture | CPU renderer / GPU process | GPU time |
|---|---|---|---|---|---|---|---|
| Stellar Forge (built-in) | VP9 746×512 + Opus 48 kHz | 30.0 (33 / 51 / 52 ms) | 0 | 0 | +27, +9, −24, −1 ms | 50 % / 23 % | 5.5 ms |
| Ember Observatory (declarative) | same | 30.0 (33 / 34 / 43) | 0 | 0 | +19, 0, −16, +23 | 53 % / 22 % | 5.4 ms |
| Blueprint Cathedral (shader, pack worker) | same | 30.0 (33 / 53 / 54) | 0 | 0 | +13, +13, −5, +18 | 61 % / 28 % | 3.8 ms |
| Cymatic Field (world, pack worker) | same | 30.0 (33 / 34 / 41) | 0 | 0 | 0, +6, −12, +11 | 59 % / 28 % | 2.3 ms |
| Starter world (`scripts/pack.js new`, SDK ^1.1) | same | 30.0 (33 / 50 / 51) | 0 | 0 | −15, +6, +22, −38 | 56 % / 27 % | 1.8 ms |

All 20 markers within ITU-R BT.1359 detectability (−45 to +125 ms). The player presents 60 fps; the recording is
captured at 30. Finalisation took 5-6 ms. Lifecycle, same run: stop and record again gives two complete files with sound
(the first version stopped the music's own audio track, so a second recording was silent: fixed by giving each
recording its own clone); switching Cymatic Field → Stellar Forge → Cymatic Field and changing quality while recording
gives one continuous 24 s file (one 312 ms frame gap while a world loads, no sound gap); the recorded sound cut
mid-recording (as a lost audio device does) finishes and saves the recording 20 ms later with what it had (3 s) and the
reason, see below; a pack failing while recording finishes and saves the file (9.9 s, with sound) and the built-in
identity takes over; without MediaRecorder or canvas capture the player explains and nothing breaks. **Three minutes**
(Cymatic Field, replay at 1×, 12 markers): 30 fps, no gap, no pilot gap; offsets −21 to +30 ms (mean +3), all within
detectability; trend +9.8 ms/min (+29 ms over the recording), jitter 11 ms; page heap 3.5 MB throughout; browser and
renderer memory grow by 208 MB while holding the 132 MB recording (6.2 Mbit/s), the GPU process stays flat. Three
three-minute runs on this machine measured trends of −2.8, −5.2 and +9.8 ms/min: no consistent direction, but drift over
recordings longer than three minutes has not been measured.

**Sound lost while recording.** The soak (below) ran into this machine's sound server stalling (WSLg's PulseAudio, around
21:40): every audio clock in the browser stopped, and two recordings came out with 43-46 s of picture and 0.24 s of
sound, because the browser's recorder (its WebM muxer) waits for sound to interleave with the picture. A test that ends
the recorded track showed worse: Chrome's recorder then produced no file at all. The recorder now watches its sound (track
ended or muted, the music's audio clock not advancing, digital silence while the music is audible) and finishes and saves
the recording at once with the reason. A device-less audio context for the recording (`sinkId: none`) was tried and
rejected: in this environment it stalled with the sound server too. Qualification runs now use Chromium's own audio
output, never the host's sound server.

**On slow machines** (CI's 4-vCPU software renderer, and this machine limited to 2-4 cores): built-in worlds render on
the player's main thread and present 6-14 fps there; recordings of them keep about half of those frames (copying the
WebGL frame into the compositor starves the capture), and the picture trails the sound by about one frame (−106 to
−160 ms on 2 cores). Packs render in their worker and record at 29-30 fps in the same conditions. The required CI tier
therefore checks the mechanism (streams, a steady stream after start-up, no pilot gap, markers paired within 250 ms)
with `--quality 3`; full runs hold the numbers above. VP8 instead of VP9 made no difference to the dropped frames.

### Pack runtime: bounded delivery and the watchdog (SDK 1.1)

`visual/robustness.qual.js`, SwiftShader, 29/29, with the testing fixtures in `packs/testing/`:

| Case | Measured |
|---|---|
| Slow pack (400 ms per frame), 20 s | at most 1 render in flight; 56 renders sent, 1,356 presentation frames skipped in the player, 0 queued in the worker; render 400 ms, latency 400 ms (max 512); all 346 semantic messages sent by T0 handled by T0 + 3 s; the player at 60 fps (p95 16.7 ms), script round trips ≤ 3 ms; still running, with a budget notice (updateMs 371 > 2) |
| Six world switches while slow renders are pending | one pack frame left, no errors, page heap 9.5 → 9.5 MB |
| Hang (endless loop) | stopped 6.4 s after the last acknowledgement; the player at 58.6 fps during the hang (p95 16.7 ms); disposal 1.2 ms; built-in world running 0.9 s later (one 600 ms frame while it compiles); the stuck worker ended 2.3 s after the stop (Chromium's own grace); nothing restarted in 12 s |
| Exception | stopped with its message; RETRY runs it again, it fails again and is stopped again: no loop |
| GPU context lost | stopped ("the GPU context was lost") |
| Hostile probe, from the pack worker | 14 probes blocked (receiver, outside fetch, XHR, WebSocket, `importScripts` of the receiver API and of an outside script, outside module import, IndexedDB, Cache Storage, DOM, parent, WebRTC, nested worker's network, navigation); the outside listener received nothing; 5,000 spoofed messages → the relay terminated the worker, the pack was stopped |
| Approval revoked / a file modified while running | stopped after 4.5 s / 3.7 s (pack list refresh every 5 s); the modified file is refused (HTTP 403) |
| Frame navigation | stopped at once |
| Hidden tab | no verdict while hidden for 12 s of a hang; stopped 7.2 s after becoming visible |
| Film frame that never comes | the film call fails after 60 s with an explicit error; no frame substituted |

The same suite's quick variant passes in CI (15/15). The reference packs pass the compatibility tests on SDK 1.1, quick
variant, in CI (all three; Cymatic Field also locally, 21/21 in 62 s), now probing isolation from inside the pack
worker as well as from the frame (the first CI run caught that the frame's page no longer removed WebRTC: restored).

### The intermittent `npm test` failure: identified and fixed

`unit-stress.js` repeated the suite with full TAP kept for every failing run. Before the fix: 27/30 runs passed at no
load. Two causes, both in the tests: the Claude Code hook test planted the "secret" `abc` and random hex event and
project ids contained it in about 2 % of runs (two failures); and tests registered "remove the data directory" before
"stop the receiver" — node:test runs a test's `after` hooks in order and skips the rest when one throws, so the removal
raced with a receiver still writing (ENOTEMPTY) and the receiver, never stopped, held the test file until its 120 s
timeout (one failure, the "receiver test" seen before). After the fix (`tests/helpers.js`): 50/50 runs at no load and
50/50 with 48 busy processes and 4 disk writers on 24 cores (runs 15-28 s). No retries anywhere.

### Platforms

- **Native Windows** (GitHub `windows-latest`, Windows 10.0.26100, Node 22.23): `npm run check`, `npm test` 115/115
  (0 skipped), the VSIX, and `platform/smoke.js` 14/14 (receiver as a process from a data directory with spaces,
  project identity of a workspace path with spaces and non-ASCII characters, token refused/accepted, projection,
  restart keeping project and token, pack CLI validate/install/approve/list, a file changed after approval reported
  and refused, loopback-only bind). Line endings are fixed to LF (`.gitattributes`) so a pack's digest is the same on
  every platform. Extended tier on the same runner: `browser/stage.qual.js` 14/14 in Chromium on Windows (live view,
  stats, audio, worlds at 56-60 fps at 1920×1080 in software rendering, replay, scrubbing, a WebM recording, WAV
  export, the OBS overlay, no file paths, no page errors) and Cymatic Field's compatibility tests 20/20 (isolation probes
  from the pack worker and the frame, privacy, idle, beat, resources, budget). The quick recording run there showed the
  slow-machine limits above (built-in worlds recorded at 2.5-3 fps; the video track ending up to 1.5 s before the sound,
  which has no gap). The extension in a real VS Code 1.143.1 on the same Windows runner (`vscode/run.js`): 32 checks
  passed, 0 failed, 1 unverified by design (the real AI agent, which needs credentials): the VSIX installed through the
  VS Code CLI, consent, baseline, typing classification, the file watcher seeing writes made outside the editor,
  create/rename/delete, tasks, the integrated terminal with shell integration, diagnostics, git, the project id equal to
  `vscode.Uri.file()` for a Windows path, the outbox queueing on disk and draining across a receiver outage, event
  order, privacy, and capture resuming after a normal VS Code restart without a prompt
  (`results/platform/vscode-qualification-windows.json`). Two Windows-only harness fixes were needed (Node runs
  `code.cmd` only through the shell; Windows locks VS Code's files while it exits). Three runs: 32/32, then 29/32 (the
  offline-period file reached the journal after the check looked, a race in the harness now fixed by waiting for it;
  and once the deliberately failing `npm test` task reported exit code 0, not explained: the check now records that its
  failing edit was applied), then 32/32 again with the edit confirmed applied.
- **WSL2 → Windows:** documented in `docs/WSL.md` with a reproducible check; not run from the Windows side (no interop
  here, and nothing is run on the owner's desktop without permission).
- **OBS Studio** (`obs/obs.qual.js`, in a disposable GitHub runner: OBS 32.2.0 from the official PPA, obs-websocket
  5.7.4, its browser source on CEF 127.0.6533.120, Ubuntu 24.04 under Xvfb, OpenGL 4.5 through Mesa llvmpipe, no GPU):
  the player's overlay added as a Browser Source with *Control audio via OBS*; source screenshots show the living world
  with its stream lower third, rendering and moving (4 of 4 screenshots distinct, mean luma about 135); the music reaches
  OBS's mixer (197 meter samples, peak −14.5 dBFS); the overlay logged no errors inside OBS. Running OBS itself found
  three things Chromium did not: OBS applies a Browser Source's custom CSS (its default transparent background) as an
  inline style, which the page's policy refused (fixed: allowed in the OBS view only); the page's corner captions
  overlapped the living world's lower third in the overlay (fixed: hidden there); without a GPU, OBS's default browser
  hardware acceleration gives the page no WebGL, and the player falls back to the Construct (on this machine OBS's
  browser runs in software: Browser Source Hardware Acceleration off). OBS's own recording of the overlay
  (`results/obs/`): H.264 1280×720 at 29.9 fps and AAC stereo 48 kHz, 20 s, no frame gap, 95 % of frames changing, the
  music at −28.4 dBFS with its longest rest 250 ms; OBS reported about 10 % of frames lagged by software rendering.
  6/6 checks. Not run: OBS on Windows or macOS, with a GPU, or OBS's own streaming output.

### Soak

`visual/soak.qual.js`: the live player with sound at 1920×1080 on the AMD integrated GPU while a synthetic session posts
events every 3 s through the receiver's real API; every hour the three built-in families, Cymatic Field, Blueprint
Cathedral, Ember Observatory and the Construct, a 12-minute pause, three one-minute recordings; a receiver restart at 90
minutes. **No local run reached its three hours** (`results/soak/soak-partial-amd.json`):

- **Overnight run, 110 minutes**, stopped when this machine's sound server stalled at about 70 minutes (see *Sound lost
  while recording*; the recordings after it are environment-affected). Events: 3,869 produced, 3,869 stored, none lost,
  including across the receiver restart at minute 90, which happened while the shader pack ran: it was not stopped, and
  the two posts refused during the outage were retried. No pack was stopped by the watchdog; no page errors. Frame rates
  steady per world (Cymatic Field and Blueprint Cathedral 60 fps; built-in families 40-60). Page JS heap 2-82 MB (garbage
  collected, no trend); GPU objects constant per world; the GPU process 262 → 349 MB; **the renderer processes grew from
  184 to 577 MB**, more slowly in the second hour (+260 MB in the first, about +105 MB in the second). Whether this levels
  off (allocator high-water marks after recordings and world switches) or keeps growing is not established.
- **Final run, 24 minutes** (Chromium's own audio output, final code), stopped by decision: 1,061 of 1,061 events
  stored, the music's audio clock at 1.00× real time in every sample, 56-60 fps, no pack stopped, no page errors; two
  recordings with the full 60 s of sound, no frame gap, no pilot gap; one marker paired at 172 ms in the Stellar Forge
  recording (the others within 48 ms), not investigated. Renderer processes 169 → 342 MB in those 24 minutes.
- **CI, one hour** (4-vCPU software renderer, 1920×1080, before the CI options): every event stored exactly once (2,102),
  page heap, DOM, GPU objects and process memory flat over the hour, sound continuous, no page errors; the shader pack
  fell under 1 fps at 1080p there and was stopped by the watchdog, as designed. The CI soak now runs at 1280×720 with a
  fixed lower level.

The renderer growth in these soaks is explained under *Renderer memory* below: most of it was the test's DevTools
connection keeping every downloaded project view, and the rest a leak in the recording's sound watchdog (fixed).

## Alpha candidate: memory, synchronisation, recording sizes

Raw results: `qualification/results/memory/`, `results/sync/`, `results/recording/`. AMD integrated GPU (ANGLE → D3D12
under WSL2) unless stated.

### Renderer memory: the soak's growth explained, one leak fixed

**Question.** The soak's renderer processes grew (184 → 577 MB in 110 minutes locally; 204 → 503 MB in CI's hour on
88daa91). Memory the product keeps, or high-water marks? Which operation?

**Measurement model.** Every Chromium process the harness starts, by type and pid, from `/proc`: resident memory split
into anonymous (heaps, allocator arenas) and file-backed (Chromium's shared memory is memfd-backed and is counted in
every process that maps it; PSS splits it), plus the page's V8 heap, ArrayBuffer backing stores and Blink's heap
(`Runtime.getHeapUsage`), DOM counters, workers, pack frames and the WebGL contexts still alive in the page (weak
references). A forced full collection (page and workers) after every operation (`--gc-each`) separates what the
collector gives back from what stays: a post-collection baseline that levels off is a high-water mark, one that rises
with every operation is retention. `visual/memory.qual.js`, the player at 1920×1080.

**1. The event-driven growth was the test's DevTools connection.** With live events every 3 s the renderer grew about
3 MB a minute while the V8 heap, ArrayBuffers and Blink's heap stayed flat; with music and no events it was flat. It
grew the same without the label overlay (2.8 MB/min), in a 2D world with no WebGL (3.0 MB/min) and with a constant
structure (`memory-bisect-*`, `memory-churn-*`). Playwright enables the DevTools Network domain on every page, and
Chromium then keeps the body of every fetched response in the renderer for DevTools; the player downloads its project
view (up to about 270 KB) each time it changes. Control, `visual/memory-detached.qual.js` (the same session for 10
minutes; the page checked afterwards: Stellar Forge, 60 fps, 1920×1080):

| Browser | Renderer anonymous memory | Trend (second half) |
|---|---|---|
| Started directly, no DevTools client | 52.8 → 62.5 MB | 1.23 MB/min (0.16) |
| Started directly, one client that sends only `Network.enable` | 48.7 → 87.5 MB | 4.2 MB/min (3.54) |
| Started by Playwright | 49 → 89.5 MB | 4.37 MB/min (3.74) |

The client's +38.8 MB matches the project views downloaded in those 10 minutes (about 38.7 MB). Every earlier soak
and memory figure taken under Playwright includes this, which is why they could not be read. Memory is now measured
with a lean driver (`visual/lean.js`: the same headless shell and flags, the DevTools protocol spoken directly, the
Network domain never enabled).

**2. A real leak: the recording's sound watchdog.** Under the lean driver, every recording kept about 2.2-2.8 MB in
the renderer and about 2 MB in the GPU process, in a straight line (18 recordings in 8 minutes, the code of PR #5 and
of this branch alike). Bisected inside the real player by wrapping its recorder (`--wrap`, 11 recordings each):

| Variant | Renderer per recording (after collection) | GPU process over the run |
|---|---|---|
| As is | 2.87 MB | 283 → 305 MB |
| Nothing drawn into the recording canvas | 2.79 MB | 275 → 297 MB |
| No download | 2.51 MB | 283 → 303 MB |
| No sound | 0.50 MB | 280 → 285 MB (flat after the first) |
| Sound, but no sound watchdog | −0.32 MB | 287 → 285 MB (flat) |

The watchdog added in PR #5 (it finishes and saves a recording when the sound stops) created a
`MediaStreamAudioSourceNode` and an analyser on the music's long-lived audio context for every recording; the browser
never released them, although they were disconnected and their track stopped, and the memory was mostly shared memory
mapped by both the renderer and the GPU process. Fixed: one listener on the music's output for the page's lifetime
(each recording still watches its own track for ending or muting, the context's state and its clock).
`visual/recording.qual.js` now checks that three recordings create one source node.

**3. A finished recording was kept for a minute.** The object URL behind the download was revoked after 60 s. Isolated
(`visual/memory-recorder.qual.js`, `memory-recorder-download-amd.json`): +0.72 MB per 5-second recording revoked after
60 s, flat after 1 s; in the player, the browser process held 18-26 MB more while recordings were less than a minute
old. Bounded, but at 1080p a 30-minute recording is about 1.8 GB held for an extra minute. Fixed: revoked 1.5 s after
the download starts (the download holds its own reference).

**4. The browser itself is bounded.** MediaRecorder and canvas capture: about 17 MB once, then flat over 20 recordings
(a new capture each time, a new canvas, a reused track). Workers, a WebGL context in a worker, three.js in a worker,
in a sandboxed iframe and on the page, each created and destroyed 40 times (`visual/memory-lifecycle.qual.js`): about
10 MB of high-water in the first half, then flat or falling. Two releases are now explicit rather than left to the
collector: a disposed world loses its WebGL context at once, and the pack worker reuses one compositing canvas.

**Before and after** (lean driver, a collection after every operation, 8 minutes each; recordings at the stage's size,
as PR #5 recorded):

| Experiment | PR #5 (0a71c5a) | This branch | Reading |
|---|---|---|---|
| Recording, Stellar Forge (18 × 20 s) | 2.22 MB per recording; renderer 206 → 244, GPU 302 → 335, browser +18 MB | 0.25 MB (second half −0.01); renderer 188 → 196, GPU 277 → 290, browser flat | fixed |
| Recording, Cymatic Field pack (18 × 20 s, worker bitmaps) | 2.22 MB (second half 3.78); renderer 215 → 259, GPU 276 → 310 | 0.42 MB; renderer 204 → 211, GPU 268 → 271 | fixed |
| World switching (21: three families, two packs) | 0.39 MB per switch; GPU +13 MB | 0.43 MB; GPU +2.7 MB | small residue, unchanged |
| Pack ↔ built-in (27) | 0.20 MB | 0.24 MB | small residue, unchanged |
| Live session, music, events every 3 s | — | −0.02 MB/min | flat |
| Events rewriting 20 fixed modules | 3.29 MB/min under Playwright | 0.07 MB/min | flat (the DevTools effect) |

**Residual risk.** A world or pack switch leaves 0.2-0.4 MB after collection within 21-27 switches; in the short soak
below each world's post-collection level stops rising after two or three visits. The browser holds a recording in memory
until it stops (see `docs/RECORDING.md`). Not measured: sessions of many hours under the lean driver, and other
browsers.

### Recording synchronisation: method replaced, one clock defect fixed, the 172 ms outlier not reproduced

**Clock path** (details in `docs/RECORDING.md`): the music converts a cue's performance time to the audio clock when it
schedules it; the picture shows the performance time read at each animation frame; the recording captures the
compositor canvas (timestamps at capture) and the music's own output stream; MediaRecorder muxes both by their
timestamps. Live performance time is the wall clock minus 10.5 s; replay time is a playhead.

**Markers v2.** The first method (a white flash and a 2 kHz click found by band energy) could take a world's own white
flash or a musical note for a marker: on a synthetic scene with 5 markers, two white flashes of its own and a 2 kHz
note, it counted 7 flashes and 7 clicks and reported a fake offset of −163 ms (`markers-selftest.json`). Now: a
full-frame pure green flash (found by chroma) and a 40 ms 3-6 kHz chirp found by a
matched filter, each offset reported as the interval between the captured frame before the flash and the flash frame.
Self-test on a synthetic WebM with known offsets and distractors (`visual/markers.selftest.js`, `markers-selftest.json`):
5/5 markers found, every true offset inside its interval, none of 2 white flashes, 1 cyan flash and 5 tones counted;
the measured offsets read 7 ms early (Opus's 6.5 ms encoder delay as decoded), so real offsets are about 7 ms later
than reported.

**A clock defect, found by the matrix and fixed.** One marker at +162 ms while switching worlds: the flash came right
after a 77 ms frame gap. In replay the playhead advanced once per animation frame and the music scheduled sound from
it, so sound scheduled between frames was late by the time since the last frame, and after a main-thread stall by the
stall. Reproduced on purpose (a 150 ms stall before each marker): +136 to +166 ms on 12 of 12 markers
(`sync-stall-before-clockfix-amd.json`); fixed by extrapolating the playhead between frames: −38 to +1 ms, and −32 to
+25 ms in the final matrix. Live mode reads the wall clock and was not affected.

**Matrix** (`visual/sync.qual.js`, `sync-matrix-amd.json`; final code; 3 recordings × 20 s × 4 markers per condition;
the player at 1280×720 replaying the Lumen Recipes recording at 4×, or live with events every 3 s):

| Condition | Markers | Offset median | Range | fps in the files |
|---|---|---|---|---|
| Stellar Forge 720p | 12/12 | −8 ms | −34…+24 | 30.0 |
| Stellar Forge 1080p | 12/12 | −7 | −57…+18 | 23.8-29.2 |
| Stellar Forge 1080p, fixed full quality | 12/12 | −6 | −39…+12 | 25.0-25.7 |
| Cymatic Field (world pack) 720p | 12/12 | −3 | −38…+21 | 30.0 |
| Cymatic Field 1080p | 12/12 | −4 | −13…+27 | 29.9-30.0 |
| Cymatic Field 1080p, fixed full quality | 12/12 | +18 | −15…+25 | 30.0 |
| Stellar Forge 1080p, two world switches while recording | 12/12 | −13 | −47…+6 | 24.8-28.4 |
| Stellar Forge 1080p, a busy process on every core | 12/12 | −7 | −27…+15 | 25.3-27.2 |
| Stellar Forge 1080p, live | 12/12 | −11 | −55…+23 | 22.9-26.4 |
| Cymatic Field 1080p, live | 12/12 | −4 | −33…+18 | 30.0 |
| Stellar Forge 720p, 150 ms stall before each marker | 12/12 | −8 | −32…+25 | 29.2-29.3 |

132 of 132 markers paired; every offset within ITU-R BT.1359 acceptability (−90…+185 ms); all but two within
detectability (−45…+125 ms): −57 and −55 ms, sound slightly ahead of the picture, both in Stellar Forge at 1080p where
the frame rate dropped below 30. Before the fix (`sync-matrix-before-clockfix-amd.json`) the Stellar Forge replay
medians were +4…+32 ms; now −13…−6 ms, as in live mode. Drift over three minutes: see *Recording sizes* below.

**The 172 ms outlier** (soak, live Stellar Forge, stage size, first method) was not reproduced: 24 live Stellar Forge
markers across the two matrix runs fell within −55…+23 ms, and the short soak below adds 177 live markers across all
five worlds (−64…+18 ms). Its file was not kept.
The first method's ambiguity is a plausible cause, not a proven one: its flash detector took any bright full frame
(Stellar Forge flashes white), and in the self-test it produced a fake −163 ms offset from exactly such a flash. The
replay clock defect cannot explain it (the soak was live). It stays an unresolved historical observation.

### Short soak: 30 minutes of activity with the final code

`visual/memory.qual.js --experiments activity --minutes 30` (lean driver, the player at 1920×1080 with music): a live
session whose project grows with every event (from 3 to 528 structures), and every minute a world switch (Stellar
Forge, Fractal Biosphere, Machine Cathedral, Cymatic Field, Blueprint Cathedral in turn) followed by a 20 s recording
at 720p with three markers, measured from the file before it is deleted. Run twice:

| Run | Recordings | Markers | Offsets | fps in the files | Renderer | GPU process |
|---|---|---|---|---|---|---|
| Natural garbage collection (`memory-activity-soak-amd.json`) | 30 | 90/90 | −55…+18 ms | 27.95-30 | 168 → 287 MB; 226 MB after a forced collection at the end | 266 → 278 MB |
| A collection after every operation (`memory-activity-soak-gc-each-amd.json`) | 29 | 87/87 | −64…+13 ms | 28.9-30 | after collection: +1.49 MB per operation in the first half, +0.04 in the second | 265 → 275 MB |

No recording failed, no page error, no WebGL context left alive, one renderer process throughout. With a collection
after every operation the renderer's level depends on the world showing and, per world, stops rising after two or three
visits (Stellar Forge 185 → 201 MB, Fractal Biosphere 183 → 203, Machine Cathedral 188 → 193, Cymatic Field 201 → 217,
Blueprint Cathedral 200 → 226, while the project grew to 528 structures): high-water marks, not retention. With natural
collection the renderer carried up to 61 MB of collectable memory before the final forced collection. Live-mode
markers in the soak (Stellar Forge included, 177 in all) stayed within −64…+18 ms.

**Is a longer soak still needed?** For the questions of this milestone, no: the growth seen in the earlier soaks is
explained (the DevTools connection, the watchdog leak) and the remaining behaviour levels off within 30 minutes. A
multi-hour run with the lean driver would still be the way to confirm hours-long sessions (allocator behaviour over
hours, many hundreds of recordings); it is not part of this milestone and would need the owner's approval.

### Recording sizes: 720p and 1080p as encoded dimensions

`visual/recording.qual.js --gpu amd` (final run: 119/120 checks; `recording-qualification-amd.json`; the files, kept
locally, `size-<world>-<size>-amd.webm`; frames `size-<world>-<size>.jpg`). The player at 1280×720 replaying at 4×; the
main recordings at the player's default size, 720p, then each size for 15 s with three markers.

| World, size | Encoded | fps in the file | File growth | Renderer CPU / GPU process CPU | GPU time per frame | Sync median (worst) |
|---|---|---|---|---|---|---|
| Stellar Forge, stage | 746×512 | 30.0 | 16.9 MB/min | 44 % / 23 % | 5.5 ms | −10 ms (21) |
| Stellar Forge, 720p | 1280×720 | 30.0 | 34.5 MB/min | 68 % / 25 % | 11.9 ms | −16 ms (38) |
| Stellar Forge, 1080p | 1920×1080 | 24.6 (27.8 in the previous run) | 49.7 MB/min | 98 % / 17 % | 24.9 ms | −1 ms (21) |
| Cymatic Field (pack), stage | 746×512 | 30.0 | 17.0 MB/min | 50 % / 27 % | 2.3 ms | −23 ms (29) |
| Cymatic Field (pack), 720p | 1280×720 | 30.0 | 35.6 MB/min | 75 % / 30 % | 3.4 ms | −22 ms (28) |
| Cymatic Field (pack), 1080p | 1920×1080 | 30.0 | 59.5 MB/min | 130 % / 34 % | 6.9 ms | −3 ms (15) |

Encoded dimensions are exactly the chosen size in every file. The composition is the same at 720p and 1080p (a 16:9
camera, labels proportional to the output; checked in the frames): nothing stretched, cut or bordered. At 1080p Stellar
Forge needs 25 ms of GPU time per frame on this GPU, so the player draws about 31 frames a second and the capture keeps
24.6-27.8: **1080p is not qualified for the built-in worlds on this machine** (reported NOT QUALIFIED, and in the
previous run one FAIL for Ember Observatory at 1080p, a 104 ms frame interval); visual packs, rendered in their worker,
hold 30. Hence 720p is the default, the player warns under 28 frames drawn per second, and 1080p is offered for GPUs
that keep up. In this run the 1080p and stage sizes were gated on a steady stream and their frame-rate assertions
reported; the one FAIL above is Stellar Forge at 1080p under the previous gating (the harness now reports it).

Main recordings at 720p: Stellar Forge, Ember Observatory, Blueprint Cathedral and Cymatic Field all at 30 fps, no
interval over 43 ms after start-up, sound continuous (no pilot gap), sync medians −13…+2 ms. Lifecycle: restart, world
switches while recording (one continuous file, one 308 ms frame gap while a world loads, no sound gap), sound lost
(finished and saved 0.5 s later, with the reason), pack failure (finished and saved, the built-in identity takes over),
one watchdog source node for three recordings. **Three minutes** at 720p (Cymatic Field): 30 fps, 12 markers −25…+19 ms,
trend −5.7 ms/min (−17 ms over the recording), jitter 12.8 ms; a 110 MB file, browser and renderer +185 MB, page heap
flat. The previous run's three minutes at 1080p: trend +0.9 ms/min, a 182 MB file, +268 MB. Drift measured so far:
−5.7, +0.9, and in PR #5 −2.8, −5.2, +9.8 ms/min: no consistent direction, at most about 30 ms over three minutes.

Memory per minute while recording (the browser holds the file plus working memory): about 60 MB at 720p and 90 MB at
1080p, against about 70 MB for PR #5's stage-size default at 6.2 Mbit/s. Streaming to disk (the File System Access API)
was evaluated and not implemented: it needs a file chosen by the user before every recording, cannot be exercised by the
automated tests, and OBS already covers long sessions.


### Regression: local and CI

Local (this machine): `npm run check`; `npm test` 115/115; `npm run package:vsix` builds `code-resonance-0.4.0.vsix`;
the built-in worlds render the same frames as PR #5's head, labels off (`visual/unchanged.qual.js --baseline 0a71c5a`,
4/4 sets, 11 moments, byte-identical); recording 119/120 (above); sync matrix 11/11; marker self-test; memory matrices
and the short soak (above).

CI on GitHub's runners (software rendering), PR #6:

| Job | Result |
|---|---|
| validation: Linux, native Windows (`npm test`, platform smoke) | 115/115 and 14/14 on each |
| qualification: Stage (Chromium), reference packs quick, runtime quick, VS Code | Stage 14/14; Blueprint Cathedral 19/19, Ember Observatory 15/15, Cymatic Field 20/20; robustness 15/15, recording 45/45 (stage size, plus Cymatic Field at 720p); VS Code passed |
| extended: full pack suites | 20/20, 16/16, 21/21 |
| extended: runtime-full | robustness 31/31, recording 81/81 (mechanism thresholds) |
| extended: history, Windows VS Code | passed |
| extended: OBS Studio 32.2 | 6/6 |
| extended: Windows browser | 45/45 on the rerun |
| extended: one-hour soak (1280×720, quality 3, recordings at the stage's size) | 11/11: 2,102 of 2,102 events stored once across a receiver restart, no pack stopped, sound at 1.000× real time, no page errors |

What CI found and what was corrected (no threshold was changed): the first run (8187762) failed the quick recording,
because with 720p as the player's default the software renderer drew the built-in worlds at 2 fps (the software-rendered
jobs now name the stage's size, as PR #5's CI tested, and quick mode adds a world pack at 720p), and OBS, because the
marker change had made the frame parser require three plane means where an RGBA screenshot has one (fixed). The second
(23f793e) failed the Windows browser job (a marker whose flash frame came more than 0.6 s after its chirp at 2.9 fps;
pairing and the functional check now use the interval in which the flash occurred; the rerun ran on a faster runner,
5.8 fps, and would have passed either way) and the one-hour soak (8/11: at 720p a shader pack fell under 1 fps while
recording on the software renderer and the watchdog stopped it, as designed; events, memory, sound and page errors
passed; the CI soak now records the stage).

## Creative Control Center (Phase 6)

The interface is qualified in a real browser (headless Chromium, software rendering) against isolated receivers on
temporary data directories (`qualification/ui/environment.js`: a copy of the real recorded lumen-recipes session, a
test project built through the ingestion API in the shape the 0.5 extension sends, and the fictional demo). Browsers are
paired with each receiver the way a user pairs theirs once; one acceptance check stays unpaired on purpose.

| Suite | What it drives through the real interface | Result (this machine) |
|---|---|---|
| home | first run (setup guide follows real state; hide persists), populated status lines against evidence, attention items, recent projects | 45/45 |
| projects | list and filter, detail statistics equal `/api/project`, timeline markers, *Replay from here* lands on the Stage at that time, independence of projects, a second window converging | 48/48 |
| visual | choose → preview → cancel (saved recipe unchanged) → apply → reload, three built-in families, title, aliases, reset, presets, stale-revision dialog, a second window converging | 60/60 |
| music | live preview audible (analyser on the output), cancel, apply per project and globally, tempo and texture, a Stage window following without restarting the music, presets | 68/68 |
| packs | zip import (declarative) and folder import (world pack) without the command line, review dialog with files and digest, approval, running in the isolated frame, revocation stops it, a file changed on disk cannot be approved or run, a path-traversal zip refused, removal | 52/52 |
| connections | receiver values equal `/api/status`, no token-like string on the page, capture states from evidence (real session, 0.5 test session, agent-only project), Claude hooks plan/apply/remove on a temporary project folder | 48/48 |
| output | 720p and 1080p recordings through the interface (WebM with video and audio), one recorder across views, *Recording in another window*, OBS URLs load the clean view without private names | 41/41 |
| settings | every global setting persists across reload, motion applies, device quality, diagnostics without tokens or names, information mode inheritance | 41/41 |
| acceptance | first run, pairing (refusal, dialog, single-use link in a fresh and in an open tab), two projects and a receiver restart, previews local to their window, saved changes reaching the Stage window and the OBS view, the OBS view never asking for a capability, recording across windows, every workspace at 1920×1080, 1440×900, 1280×720 and 900×800 without overflow, visible keyboard focus | 73/73 |

All nine suites: 476/476 checks on the final code (`node ui/run-all.js --jobs 3`, about 15 minutes). Measured in the
acceptance suite (software rendering): a project captured through the ingestion API appeared in an open
Control Center in about 0.4 s (change feed); a saved recipe reached the Stage window and the OBS view through the change
feed in about a second, and their new world was running after about 18 s, almost all of it building the world on the
software renderer. The music kept playing through the change.

The existing harnesses drive the new Stage (`#/stage`) and pair with the receiver they start. Locally, on the final
code: `npm test` 174/174; platform smoke 14/14; Stage 14/14; audio passed; reference packs quick 16/16, 20/20, 21/21;
robustness quick 15/15; recording quick 45/45. `npm test` 30/30 runs under `unit-stress.js --load 12 --io 2` after
one timing-dependent test was made deterministic (24/30 before; the receiver's behaviour was correct, the test assumed
which of two orders happened).

**In CI.** GitHub's runners for this private repository have two cores and no GPU. There, the studios that render WebGL
continuously (Visual, Music, Record & Broadcast) and the acceptance scenarios with three windows rendering at once starve
the browser (measured on PR #7: clicks timing out after 30 s, screenshots refused, a saved change taking 105 s to appear
in the other windows). The required `ui` job therefore runs Connections, Home, Packs, Projects, Settings and the
single-window acceptance scenarios at the Lowest quality; the whole interface qualification is the extended job
`ui-full` (label `extended:ui-full`) and the local gate above. Reproduced locally on two pinned cores (`taskset -c 0,1`)
before changing the jobs.

Reviews before the pull request: backend security and correctness (fixed: a symbolic link that let the Claude route
return any JSON file the receiver can read, including its token; a pack id that destroyed the approval store; an empty
digest skipping the approval check; edits of a recipe whose pack is missing overwriting it), interface honesty
(fixed: a dead global information-mode setting, a project world that could never follow the global default again, a
demonstration not labelled on the Stage), privacy (fixed: an open project menu and a toast that could carry private
names onto the Stage, a typed project path kept in browser storage), design and accessibility, and a final review of
pairing and late state changes (fixed: pairing links that carried the durable key, a recipe answer applied to the
wrong project, Visual Studio dropping "follow the global default", previews of classic stages being recordable).

## Auto quality (desktop milestone)

Live playback at the Auto quality (Settings › This device) is governed by `createQualityGovernor` in
`public/worlds/host.js`; the rules and every threshold are in the comment above `AUTO_QUALITY`. In short: half-second
windows of the presented frame rate; down after 2 s under 24 fps (straight to a lower resolution when MSAA alone cannot
reach 27 fps), at once to the level expected to reach 30 fps after 1 s under 12 fps; up one level only after 20 s in
which the level above is predicted to hold 30 fps (from the GPU time where the browser measures it, otherwise from the
frame rate and what was seen at the levels left for slowness); a step up that turns slow within 10 s goes back and that
level waits three times longer (at most 10 minutes). Where the GPU time is known, slow frames lower the level only while
the GPU accounts for at least half of the frame time. **Degraded**: under 8 fps for 5 s at the lowest level (or where
no level helps, or at a fixed quality): the player (`state.rendering`, `__worldStats().degraded`) says so and the
interface gets one warning notice per quality choice offering Monolith (the Canvas 2D world); the selected world is never
changed without the viewer. Films and fixed qualities never adapt; the four levels themselves are unchanged. A level
change only switches MSAA and resizes the render targets: no shader is compiled and the texture count does not change.

Unit: `tests/adaptive-quality.test.js` (16 simulated machines: step-down time, level skipping, no oscillation around a
threshold, climbing back after a busy period, back-off after failed attempts, cost-bound and GPU-timed machines,
processor-bound slowness, degraded and its recovery, pauses, fixed levels).

Real page (`/?world=living&project=<Lumen>#/stage`, Auto, 70 s, headless Chromium; the machine was shared with other
qualification runs, load average 22–35 on 24 threads, so these are pessimistic). Times are from the world's first
reported statistics, which includes its first frames (shader compilation, several seconds on SwiftShader):

| Renderer, viewport, world | Level changes | Stable from | Then | Programs / textures |
|---|---|---|---|---|
| AMD integrated GPU (D3D12), 1920×1080, Fractal Biosphere | none | start | High, 37–39 fps, GPU 24–26 ms | 18 / 14 throughout |
| AMD integrated GPU, 2560×1440, Fractal Biosphere | High → Medium at 4.7 s (22 fps, GPU 43 ms); Medium → Low at 46 s (a dip under 24 fps for 2 s, GPU 33 → 39 ms) | 46 s | Low, 42–49 fps, GPU 18–20 ms; no climb (Medium predicted at 35 ms) | 18 / 14 before and after each change |
| SwiftShader pinned to 2 cores, 1280×720, Stellar Forge | High → Lowest at 7.0 s (very slow, 0.3 fps) | 7 s | Lowest, 2.8–3.3 fps; degraded at 12.9 s, notice shown | 29 / 17 before and after |
| SwiftShader pinned to 2 cores, 1280×720, Machine Cathedral | High → Lowest at 3.6 s | 3.6 s | Lowest, 1.9–2.3 fps; degraded at 10.0 s, notice shown | 18 / 15 before and after |
| SwiftShader pinned to 2 cores, 640×360, default world | High → Lowest at 4.6 s | 4.6 s | Lowest, 5.4–6.2 fps; degraded at 10.0 s | 29 / 17 before and after |

No run oscillated: one change at most in 60 s on SwiftShader and on the AMD GPU at 1920×1080, two (both downward) at
2560×1440. The same page with `?quality=0&adapt=0` on the AMD GPU at 1920×1080: 35–39 fps, GPU 25–27 ms. Before this
change (from the code, not measured again): Auto stepped down one level after 3 s of a smoothed frame time over 1/28 s
and up after 20 s under 1/55 s, without GPU time, memory or back-off.

## Not verified

- macOS. Native Windows on a desktop with a GPU (CI's Windows runners render in software). VS Code Remote-SSH. A
  Windows browser or OBS on Windows reaching a receiver in WSL2.
- Native GPU browsers (GPU numbers above are through WSL2's translation layer); Firefox and Safari.
- Artistic acceptance of the Construct and of the living worlds (Stellar Forge, Fractal Biosphere, Machine Cathedral),
  and whether people who do not code understand them without explanation.
- OBS Studio itself (the overlay was verified in Chromium; OBS's CEF and its audio capture were not).
- Human listening and viewing evaluation. Metrics show the audio is clean, varied and responsive; whether it is
  enjoyable for hours needs people to listen.
- A completed multi-hour soak with the final code and the lean driver (local runs reached 110 and 24 minutes, CI one
  hour, all under Playwright, whose DevTools connection inflated the renderer; the growth they showed is explained
  under *Renderer memory*), and multi-hour real development sessions.
- Rename detection in a real editor session: interpretation v6 keeps a renamed file's identity and plot (explicit
  rename events, or a delete and create with matching symbols); this is unit-tested, not exercised in a recording.
- AI agents other than Claude Code.
- Visual pack isolation outside Chromium (Firefox, Safari, OBS's CEF): the probes ran in headless Chromium only.
- That a browser contains a hostile GPU shader: not promised (see `docs/packs/security.md`); the reference packs are not
  hostile, so the tests show isolation of network, storage and the player, not of the GPU.
- A live session longer than 10,000 timeline windows (a 12,796-window replay and synthetic histories up to 1,000,000
  intents were qualified). Recordings longer than three minutes (the browser holds a recording in memory, about 60 MB a
  minute at 720p and 90 MB at 1080p; OBS is the recommended recorder for long sessions).
- Recording quality on machines slower than the AMD integrated GPU used here: on software rendering, built-in worlds
  record at a few frames a second (see above).
- Artistic acceptance of Cymatic Field, Blueprint Cathedral and Ember Observatory.
- The Control Center on a GPU, on Windows or macOS, and in Firefox or Safari (the interface suites ran in headless
  Chromium with software rendering on Linux); Visual Studio thumbnails and live previews on a GPU.
- The VS Code extension 0.5 in the owner's VS Code; the `vscode://zerobandwidth.code-resonance/settings` link opened from
  a real browser (CI runs the extension in a real VS Code, which does not open links).
- Pairing on Windows file permissions (`receiver-auth.json` relies on the user profile's permissions there), and whether
  a browser's history keeps a used pairing link (the code is single use and expires in 15 minutes).
- Human review of the interface's design and wording.

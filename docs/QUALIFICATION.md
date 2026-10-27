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
```

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

## Not verified

- Native Windows and macOS (no Windows Node, and WSL interop is disabled in this environment). VS Code Remote-SSH.
- Native GPU browsers (GPU numbers above are through WSL2's translation layer); Firefox and Safari.
- Artistic acceptance of the Construct and of the living worlds (Stellar Forge, Fractal Biosphere, Machine Cathedral),
  and whether people who do not code understand them without explanation.
- OBS Studio itself (the overlay was verified in Chromium; OBS's CEF and its audio capture were not).
- Human listening and viewing evaluation. Metrics show the audio is clean, varied and responsive; whether it is
  enjoyable for hours needs people to listen.
- Multi-hour real development sessions (the longest soak was 30 minutes).
- Rename detection in a real editor session: interpretation v6 keeps a renamed file's identity and plot (explicit
  rename events, or a delete and create with matching symbols); this is unit-tested, not exercised in a recording.
- `npm test` failed once (one receiver test) while the machine was saturated by parallel renders; it did not
  reproduce in 7 later local runs or 2 GitHub runs, and its output was not captured. On this branch one run in 13
  failed one test (89/90) right after a full browser qualification; that output was not captured either, and the 12
  later runs (5 of them during two parallel film renders) passed 90/90. The flaky test is not identified.
- AI agents other than Claude Code.
- Visual pack isolation outside Chromium (Firefox, Safari, OBS's CEF): the probes ran in headless Chromium only.
- That a browser contains a hostile GPU shader: not promised (see `docs/packs/security.md`); the reference packs are not
  hostile, so the tests show isolation of network, storage and the player, not of the GPU.
- Recording a pack world with the player's ● RECORD button (films only), and a live session longer than 10,000 timeline
  windows (a 12,796-window replay and synthetic histories up to 1,000,000 intents were qualified).
- Artistic acceptance of Cymatic Field, Blueprint Cathedral and Ember Observatory.

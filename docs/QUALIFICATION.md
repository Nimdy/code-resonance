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
  The RTX 5090 was not used. Native browsers (Windows ANGLE D3D11, macOS Metal) were not measured.
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
- **Agents in Lumen Recipes:** 142 lifecycle intents from 6 agents; each presence appears with its session, follows
  its tool activity (reading, searching, editing, running, testing) and departs when its session ends.
- **Music balance** (`audio/balance.js`, the real Lumen timeline through the PR #2 and the current `music.js`):
  integrated loudness -23.1 → -23.5 LUFS, true peak -12.1 → -11.1 dBFS, energy below 120 Hz -1.5 dB relative,
  above 200 Hz +4.2 dB, above 2 kHz +10 dB, stereo phase correlation 0.79 → 0.52. Not yet reviewed by ear.

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

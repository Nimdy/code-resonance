# Architecture and developer guide

Code Resonance is a listener and interpreter—not a code editor, test runner, AI agent, or autonomous code writer. It never executes captured source. It turns observed activity into a recorded performance that a separate player renders as music and visuals.

This is the developer's entry point: how the repository is organised, how data flows and who owns which state, the
boundaries the code keeps, the versions that protect existing identities, the receiver's HTTP API, how to extend it,
and how to check a change without touching your own data.

## Repository structure

```text
extension/      VS Code extension: capture, durable outbox, shared path and command rules (packaged as the VSIX)
receiver/       loopback HTTP API, journal + content blobs, configuration documents, compositions, pack import, pairing
engine/         interpretation: AST analysis (languages/), the reducer, canonical intents, CAST catalog (providers.js),
                windowing worker, Visual Recipes (recipe.js), the parameter catalogue, pack validation
public/         the player, served by the receiver:
  app.js          the engine: performance clock, scheduling, worlds, replay, recording, exports (window.ResonancePlayer)
  score.js        the score (composition): v2 classic and v3 composed, pure and deterministic
  providers.js    CAST catalog (player copy of engine/providers.js)
  music.js        the Web Audio performer and offline renderer
  recording.js    live WebM recording
  composition.js  the Artist Studio's data model (allowlists, limits, validation); composition-text.js its words
  construct.js    the Construct (WebGL2, three.js)
  worlds/         the living worlds: host, renderer core, the six built-in families and the Aurora preview, director,
                  agents, labels,
                  Monolith (monolith.js, the 2D world and last fallback),
                  musical expression, Artist Studio layers (layers*.js, canvas.js), the pack frame and worker, the
                  Visual Pack SDK (sdk.js); life/ the digital-life simulation
  ui/             the Control Center and the Performance Stage: shell, store, one module per workspace
  web-demo/       the web demo's static mode and landing (only in the site npm run site builds; docs/WEB-DEMO.md)
sdk/            the performance-frame contract; project identity shared with hooks and CLIs
scripts/        receiver tools (doctor, pair), VSIX packager, demo, generic event CLI, visual pack CLI (pack.js),
                Claude Code, Cursor and Codex hooks (hooks/)
packs/          the pack manifest schema, reference packs (examples/), starter templates, runtime test fixtures (testing/)
tests/          unit and integration tests (node:test, no dependencies)
qualification/  real-environment harnesses: VS Code, Chromium, audio, OBS, worlds, recording, the interface (own npm ci)
docs/           user, creator and developer documentation (index: docs/README.md); history/ for historical records
vendor/         the TypeScript compiler used for AST analysis; public/vendor/ three.js
```

## Components and data flow

```
VS Code extension (workspace host)        Agent hooks (Claude Code, Cursor, Codex) / event CLI
  handlers only enqueue; durable outbox     opt-in, explicit, category + counts only
                 \                               /
                  ▼                             ▼
            127.0.0.1 receiver  ── bearer token, Host/Origin checks, per-event validation
                  │  stamps receivedAt (monotonic) and appends
                  ▼
     events.jsonl (raw observations, append-only)  +  blobs/ (gzip snapshots, content-addressed)
                  │
            worker thread (1 s scans)
                  │  5 s windows from receivedAt · AST diff · interpretation (reducer)
                  ▼
     performance.jsonl (recorded timeline: frame + cues + graph delta per window, keyframes)
     state.json (checkpoint) · public.json (cached view)
                  │
            GET /api/project · /api/timeline   (cached in memory, ETag)
                  │
               engine (public/app.js) ── one performance clock (live = now − ~10.5 s, replay = playhead)
                 ├── score.js      composition: v2 classic or v3 composed (pure, deterministic)
                 ├── music.js      Web Audio performer, offline renderer
                 ├── worlds/       living worlds: built-in families, finishes, digital life (life/), Artist Studio
                 │                 layers; packs with code in an isolated frame and worker
                 ├── construct.js  the Construct (WebGL2); worlds/monolith.js is Monolith (Canvas 2D)
                 └── recording.js  live WebM of the stage and the music
                  ▲
        Control Center and Performance Stage (public/ui/) drive it through window.ResonancePlayer
```

The engine renders no controls: the Control Center and the Performance Stage (`public/ui/`) drive it through
`window.ResonancePlayer`, and configuration lives in the receiver (settings, project preferences, presets, recipes,
compositions), announced to every open view by `GET /api/changes`. See [docs/CONTROL-CENTER.md](docs/CONTROL-CENTER.md).

When a world cannot run, the engine falls back and says so: the living world (WebGL2) to the Construct (WebGL2 too,
through three.js r170), the Construct to Monolith (Canvas 2D). A machine on which no quality level draws the living
world smoothly gets a notice offering Monolith; the selected world is never changed without the viewer.

**Who owns which state.** The receiver owns everything that persists: the journal and derived files, settings,
project preferences, presets, recipes, compositions, packs and approvals ([where each
lives](docs/CONTROL-CENTER.md#where-configuration-lives)). A window's engine owns the session: sound, live or replay,
the playhead, recording. Previews (Visual Studio, Music Studio, Artist Studio) live in the window that made them and
nothing stores them until they are applied (`POST /api/recipe/preview` computes a candidate and never writes). The
browser keeps only its pairing key, the device's quality and a few conveniences ([SECURITY.md](SECURITY.md)).
Writes go to the receiver and come back through the change feed ([how views stay
consistent](docs/CONTROL-CENTER.md#how-views-stay-consistent)).

## Data authority

1. **Observations** are identified, timestamped and durably stored before any analysis (`events.jsonl`, blobs). They are never rewritten.
2. **Interpretations** (symbols, cues, progress, tension, frames) are derived and versioned (`INTERPRETATION_VERSION` in `engine/reducer.js`). When the version changes, a project's derived files are rebuilt from its journal. Inferred cues carry `category: 'inferred'`.
3. **Validation** means the observed command exited 0. It is not a claim that the software is correct.
4. **AI provenance** defaults to `unknown`. A change is attributed to an agent only when it follows that agent's own hook-reported tool event for the same file within 60 s (`attribution: 'correlated'`). Hidden reasoning cannot be inferred and is never claimed.
5. **The taxonomy only grows.** Event kinds are added, never repurposed, so old journals stay interpretable.

## Determinism and replay

- Windows derive from the receiver's `receivedAt`, never from when a scan happens to run. A forced flush is itself recorded in the journal (`control.window.close`), so forced cuts replay too.
- Re-interpreting a journal reproduces `performance.jsonl` byte-for-byte (tested). Frames appended after the last checkpoint are truncated on restart and regenerated identically.
- The score is a pure function of the project seed, frame state, bar index and palette; bars are anchored to the performance clock. `ResonanceMusic.renderOffline` renders a recorded performance without real-time playback (used for WAV export and audio qualification).
- What is exact and what is not: the notes (every bar, every event's figure) are identical on every render. The score v2 output is pinned by digest in `tests/score-v3.test.js`. The rendered *samples* are not bit-identical from one offline render to the next, before or after Phase 11, on the same machine: up to about 10 LSB (−70 dBFS) on a few percent of samples, from Chrome's offline Web Audio. Compare renders by loudness, range, peak and band levels (`qualification/audio/score-versions.js`), which agree to 0.01 dB, not by bytes.

## Timing

Window 5 s, grace 1.5 s, worker scan 1 s. Measured from posting to the recorded timeline: median 5.1 s, p90 6.3 s, max 6.4 s; the extension outbox adds up to 2.5 s and the player poll up to 1 s. The player uses one fixed delay (window + grace + scan + 3 s ≈ 10.5 s), so every event plays at its true relative time and sound and image share one clock.

## Performance boundaries

- Editor handlers only enqueue. Typing is summarised per file per second; snapshots are debounced (1.2 s) and capped at 150 KB; the outbox persists batches every 500 ms and delivers every 2 s.
- The outbox quarantines permanently rejected batches, holds back the baseline index until a receiver is reachable, and caps queued content at 256 MB.
- The receiver main thread serves cached projections and byte-indexed timeline pages; parsing, AST analysis and projection happen in the worker. Measured on a real 448-file project after an hour of simulated edits: `GET /api/project` 3 ms, sort per window 61 ms, `state.json` 7.6 MB.
- The public graph shows every module (up to 700) and fills a 1400-node budget with the most meaningful symbols. Monolith (Canvas 2D) draws it as flat shapes and copies an unchanged frame from a cached layer; the living worlds instance their geometry (a few draw calls per kind of thing).

## Visual packs and recording

- **Pack runtime.** A pack with code never runs in the player's origin. The player verifies every approved file's SHA-256
  and the pack digest, then creates `<iframe sandbox="allow-scripts">` (`public/worlds/frame.js`: opaque origin, a
  content policy with no connections). The frame runs no pack code: it starts a dedicated worker
  (`public/worlds/pack-worker.js`), transfers the canvases to it as `OffscreenCanvas`, and relays known message types.
  The worker runs the same world host as the player, fed only with the privacy-safe view (`public/worlds/view.js`).
- **Bounded delivery** (`public/worlds/remote.js`). Every render request is acknowledged; at most one is in flight, so a
  slow pack gets presentation frames skipped, never a backlog. Semantic messages (structure, cues, intents, recipe) are
  always sent, in order, and counted on both sides. Films await each exact frame (60 s, then an explicit error). A
  watchdog stops a pack that stops answering (6 s), delivers under 1 fps for 20 s, throws, loses its GPU context, floods
  the relay, navigates, is revoked or modified; the player falls back to the built-in identity and keeps the recipe.
- **Recording** (`public/recording.js`). One player-owned 2D canvas receives each presented frame: the built-in worlds'
  canvases, or the bitmap a pack's worker composited (world and labels) and returned with its acknowledgement. That
  canvas's `captureStream()` and the music's own output (a `MediaStreamDestination` on the same audio graph and clock)
  go to `MediaRecorder` (VP9/VP8 + Opus). No second clock; isolation is untouched. Deterministic films remain a separate
  path (`qualification/visual/film.js`).

## Versions and compatibility

The product, its data formats and its creative generators each carry their own version. They are independent: a new
score or generator version does not change the product version, and the product version says nothing about what an
identity plays or shows. Existing identities keep their sound and image because each one records the versions it was
made with, and older versions stay in the code.

| What | Current | Defined in | Rule |
|---|---|---|---|
| Product | 0.8.1 | `package.json`, `extension/package.json` | Not bumped for format, score or generator changes. Last published GitHub Release before 0.7: `v0.6.0` |
| Interpretation | 11 | `engine/reducer.js` `INTERPRETATION_VERSION` | Independent of the product version. A change rebuilds each project's derived files (`performance.jsonl`, `state.json`, `public.json`) from its journal, which is never rewritten. Event kinds are only ever added. v8 assigns CAST seats from the provider catalog and emits `agent.collision` when two providers share a file or district inside 60 s; v9 counts only catalogued providers for it and gives its cue weight 0, so it adds no progress (`tests/reducer.test.js` pins that two agents keep one agent's progress and chapter); v10 adds language adapters for Go, Rust, Java, Kotlin, C#, Swift, C/C++, PHP and Ruby, deeper Python, packages declared by go.mod, Cargo.toml and composer.json, and each language's test-file convention, while every JS/TS file keeps its v9 structure and test flag (`tests/languages-*.test.js`); v11 names a subagent's parent: once a subagent event ties a subagent to an agent already observed in its own session (every adapter keys a subagent `<session>/<its id, type or task>`), its `agent.state` intents carry `subject.parentAgentId`, that agent's public id, and nothing else changes (`tests/agent-parents.test.js`) |
| Score | 2 (classic, frozen) and 3 (composed) | `public/score.js`; chosen per identity by `genome.music.score` | A recipe without `music.score` plays 2. v2's output is pinned by digest (`tests/score-v3.test.js`). A change that alters what an existing identity plays is a new score version, never an edit of an old one |
| Visual Recipe | schema `code-resonance.recipe.v1`, generator 5 | `engine/recipe.js` `RECIPE_SCHEMA`, `RECIPE_VERSION` | A stored recipe keeps its values. Each generator adds values from its own random stream (or none), so earlier values are unchanged (`tests/recipe.test.js` pins them); an identity saved before 4 is redrawn with 3 and gains 4's values only through a deliberate tune, one saved by 4 is redrawn with 4. v5 lets the family scores choose Synaptic Storm, Fractal Continuum and Temporal Terrain (each scored from its own stream after the flagships' unchanged draws), gives their new identities digital life and adds the trait `grown`; v4's families, draws and values are unchanged (`tests/generator-v5.test.js` checks them against the generator before it) |
| Renderer | 1 | `engine/recipe.js` `RENDERER_VERSION` | The world renderers a genome is written for |
| Finish | absent (Classic), `clean`, `cinematic`, `dreamlike` | `genome.technique.finish` | Absent is the classic composite exactly (`tests/finish.test.js` pins it) |
| Digital life | simulation 1; ecology 1 or 2 | `public/worlds/life/sim.js` `SIM_VERSION`; `genome.life.ecology` | No `life` (or `enabled: false`) draws no ecosystem. An absent ecology is 1, bit for bit (`tests/life-driver-generations.test.js` pins its digests) |
| Parameter catalogue | 1.0 | `engine/catalog.js` `CATALOG_VERSION` | Parameters are added, never removed: stored recipes and packs carry them |
| Visual Pack SDK | 1.3.0, World API 1 | `engine/packs.js` and `public/worlds/sdk.js` `SDK_VERSION` (kept equal) | Packs declare `^1.0` to `^1.3`; older packs run unchanged ([migration](docs/packs/migration.md)) |
| Artist composition | `code-resonance.composition.v1`; the library `code-resonance.compositions.v1` | `public/composition.js`; `receiver/compositions.js` | Normalised on every read and write: allowlisted types, signals and targets, clamped values |
| Receiver documents | `code-resonance.settings.v1`, `preferences.v1`, `presets.v1` | `receiver/store.js` | Validated on read and write, written atomically, `revision`-checked |
| Exchange formats | `frame.v1`, `intent.v1`, `timeline.v1`, `performance.v1`, `evidence.v1`, `export.v2` | `engine/`, `receiver/` | Each document names its schema (`code-resonance.<name>.v<n>`) |

## Receiver HTTP API

Everything is on `127.0.0.1:<port>` (4174 by default) and needs a localhost `Host` header; cross-origin requests are
refused. Reads return derived, privacy-safe data. **Administrative** routes need a control capability
(`X-Resonance-Capability`); **ingestion** routes need the bearer token in `receiver-auth.json`.

| Route | Use |
|---|---|
| `GET /health` | Status, version and timing (window, grace, scan interval) |
| `GET /v1/challenge?nonce=&v=2` | Occupant proves it holds the ingestion token: `{ok, v:2, proof}`, proof = HMAC-SHA256(token, `cr-challenge-v2\|<port>\|<nonce>`) for the port the request arrived on (32-hex nonce). Every client that sends `Authorization` checks it first and never follows a redirect (`extension/proof.js`). Without `v`: HMAC-SHA256(token, nonce), for extensions from 0.7.1 |
| `GET /api/status`, `/api/evidence?id=`, `/api/integrations` | Receiver health (its data directory only to a capability); what capture was observed per project; integrations |
| `GET /api/projects` | Projects, most recent first |
| `GET /api/project?id=` | Anonymised graph, stats and recent frames (ETag) |
| `GET /api/timeline?id=&after=&limit=[&fields=intents]` | Recorded performance, paged (`/api/replay` is an alias); `fields=intents` returns only each window's intents |
| `GET /api/highlight?id=` | Scored highlight window for Home Last night and `npm run film` (from, to, speed, reasons, CAST providers; no folder name) |
| `GET /v1/performance/frames?id=&after=` | Versioned performance frames (`sdk/performance.js`) |
| `GET /api/export?id=` | Streamed derived export |
| `GET /api/recipe?id=[&fallback=1]`, `/api/recipe/tunable?id=`, `/api/catalog` | The Visual Recipe (with its `revision`; `fallback=1` is the identity without packs), what can be tuned, the parameter catalogues |
| `GET /api/settings`, `/api/preferences?id=`, `/api/presets` | Global settings, a project's preferences, presets |
| `GET /api/compositions`, `/api/compositions/export?id=&author=&license=&description=` | The Artist Studio's library; a composition as a data-only pack ([ARTIST-STUDIO.md](docs/ARTIST-STUDIO.md#receiver-api)) |
| `GET /api/packs`, `/api/packs/readme?id=`, `/api/packs/templates`, `/api/packs/file?id=&path=` | Installed visual packs (kind, version, digest, files, approval, problems, parameters, usage), READMEs and files as inert text (code only once approved), starter templates |
| `GET /api/changes` | Server-sent events: what changed, so every open view converges |
| `GET /docs/<name>` | The documents the Control Center opens, from a fixed list, as inert text |
| `GET /pack-frame.html` | The isolated frame code packs run in (no connections allowed) |
| `POST /api/session` | A control capability, for a paired browser only |
| `POST /api/recipe`, `/api/recipe/preview`, `/api/settings`, `/api/preferences`, `/api/presets`, `/api/compositions`, `/api/packs/{import,install,discard,trust,remove}`, `/api/integrations/claude/{plan,apply}`, `/api/integrations/cursor/{plan,apply}`, `/api/integrations/codex/{plan,apply}` | Administrative (`/api/recipe/preview` never writes) |
| `POST /v1/events` | Ingestion: valid events kept, rejections listed |
| `POST /v1/flush?id=`, `/v1/rebuild?id=`, `/v1/pairing-code` | Token holders: close the open window, re-interpret from the journal, a single-use pairing link |

The page itself (`/`, `/?overlay=1` for OBS), its modules (`/ui/…`, `/worlds/…`) and the vendored three.js are served
with a self-only content policy. Never expose the token or the pairing key in a stream, an issue or a commit.

## Extending it

- **A built-in world family** is one module implementing the World API (`rebuild`, `update`, `cameraGoal`, `effect`,
  `dispose`, and optional hooks such as `describe`: `public/worlds/sdk.js`), listed in the host's built-in families
  (`public/worlds/host.js`) and the recipe's (`engine/recipe.js`), with its tunable values in `engine/catalog.js`. It
  never touches capture or semantics. Outside the repository, a world pack does the same through the SDK
  ([docs/packs/README.md](docs/packs/README.md)).
- **A new event kind** needs an intent in `engine/intents.js` and, optionally, a line of vocabulary per family in
  `engine/recipe.js`. Kinds are added, never repurposed.
- **A language** is an adapter in `engine/languages/` (`{id, test, analyze}`: symbols and imports). The brace languages
  share `engine/languages/scan.js` (a lexer that blanks strings and comments without moving an offset, a statement
  walker, annotation and signature readers, and the symbol table every adapter keys the same way); the import contract
  (`target`, `alt`, `candidate`, `ext`, `dir`, `manifest`) and the manifest layouts are in `engine/languages/index.js`.
  An adapter says in its header what it does not recognise; a construct it cannot read reliably yields no symbol.
- **A tunable parameter** goes in `engine/catalog.js`. A new value that the generator draws for new identities needs a
  new generator version and its own random stream, so that every earlier value stays as `tests/recipe.test.js` pins it.
- **An Artist Studio layer type** spans the model (`public/composition.js`), its renderer (`public/worlds/layers-gl.js`,
  forms in `layers-forms.js`) and its words (`public/composition-text.js`). The six types are also a contract with
  exported creation packs, which other installations validate against them.
- **Music:** a change that alters what an existing identity plays is a new score version, as v3 was.

## Developing without touching your data

Run a second receiver on its own data directory and port; your own receiver, identities and approvals stay as they
are. A browser keeps a separate pairing for each address, so pairing the second one changes nothing for the first.

```bash
RESONANCE_DATA=/tmp/cr-dev RESONANCE_PORT=4175 npm start
RESONANCE_DATA=/tmp/cr-dev npm run pair      # the port is read from that data directory
RESONANCE_DATA=/tmp/cr-dev npm run demo      # a fictional session (or node scripts/event.js --data /tmp/cr-dev …)
```

In PowerShell, set `$env:RESONANCE_DATA` and `$env:RESONANCE_PORT` first. `doctor`, `pair` and `scripts/pack.js` also
take `--data <dir>`. The VS Code extension always delivers to the receiver of `~/.code-resonance`: to try the extension
in isolation, use the qualification's own VS Code instance (`qualification/vscode/run.js`). Other isolated setups:
`node qualification/ui/serve.js` (a seeded installation with a recorded project, a test project and the demo; prints
its pairing link), the tests (each makes and removes its own temporary directories) and `qualification/visual/film.js
--copy` (renders from a temporary copy, so the data directory's recipes are never changed).

## Focused checks

```bash
npm run check                                  # syntax check of the JavaScript modules
npm test                                       # unit and integration (node:test, no dependencies)
node --test tests/recipe.test.js               # one area at a time
npm run package:vsix                           # the VSIX, built with Node only
node scripts/pack.js validate <dir>            # a visual pack's manifest and files
```

The creative output is pinned: `tests/score-v3.test.js` (the classic score's digest), `tests/recipe.test.js` (every
generator's values) and `tests/generator-v5.test.js` (v5, and v3 and v4 against the generator before it), `tests/life-driver-generations.test.js` (ecology 1), `tests/finish.test.js` (the classic
composite), `tests/layers-swarm.test.js` (a composition's particle population). A change that moves one of them changes
what existing identities look or sound like. For the music, see [docs/MUSIC.md](docs/MUSIC.md#checking-it); for the
images, `node qualification/visual/unchanged.qual.js --baseline <commit>` renders the built-in worlds against a
baseline commit (identical on the same GPU and driver).

## Qualification

The real-environment harnesses live in `qualification/` (Node, Playwright's Chromium, ffmpeg; their own install). The
results of each milestone, as measured then, are in [docs/QUALIFICATION.md](docs/QUALIFICATION.md).

```bash
cd qualification && npm ci
npx playwright-core install chromium                  # once, if not cached
xvfb-run -a node vscode/run.js                        # real VS Code extension host (+ CR_QUAL_AGENT=claude for a real agent)
CR_QUAL_EXTENSION_REF=<git ref> xvfb-run -a node vscode/run.js   # qualify the extension as of any commit
node browser/stage.qual.js [path-to-a-real-repo]      # Stage in Chromium
node browser/audio.qual.js                            # offline renders, loudness metrics, WAV excerpts
node browser/soak.qual.js                             # long live playback (CR_SOAK_MINUTES)
node audio/score-versions.js --data <dir> --project <id> [--seconds 180]   # both scores, every style, measured
node audio/balance.js --data <dir> --project <id> [--base <git-rev>]       # spectral balance before/after a synthesis change
node session/history-session.js <repo> /tmp/cr-session 120 30   # build a 30-minute real-code session
node session/session.qual.js /tmp/cr-session <projectId>          # render and analyse it
node visual/datasets.js results/datasets --excalidraw <repo> --self <repo> --long 300   # datasets for the visual checks
node visual/worlds.qual.js [--gpu amd] [--only determinism,idle,live,performance] [--families a,b] [--size WxH] [--fps 15] [--tag name]
node visual/construct.qual.js [path-to-a-real-repo]   # the Construct (CR_QUAL_GPU=wsl for the GPU under WSL2)
node visual/life.qual.js [--gpu amd]                  # digital life in the player: determinism, frame rates, idle, seeks
node visual/life-perf.js / life-cpu.js / life-music.js   # digital life: cost in the player, CPU per tick, what the music changes
node visual/history.qual.js                           # long histories, synthetic, up to 1,000,000 intents
node visual/long.qual.js                              # long-history replay in the player (lumen-long fixture)
node visual/unchanged.qual.js [--baseline <ref>]      # built-in worlds render the same frames as a baseline commit
node visual/pack.qual.js <pack dir> [--gpu amd]       # visual pack compatibility (= node scripts/pack.js test)
node visual/catalogue.qual.js [--families a,b]        # every family at the extremes of its parameter catalogue
node visual/recording.qual.js [--gpu amd] [--quick] [--pack <dir>]   # live recording of every renderer category, measured from the files
node visual/robustness.qual.js [--gpu amd] [--quick]  # pack runtime: slow, hanging, failing, context-loss, hostile fixtures
node visual/soak.qual.js --hours 3 [--gpu amd]        # hours of live playback with packs, idle, recordings, a receiver restart
node visual/sync.qual.js [--gpu amd]                  # recording synchronisation per condition (worlds, sizes, load, switching, live)
node visual/markers.selftest.js                       # the synchronisation markers against known offsets
node visual/memory.qual.js [--gpu amd] [--gc-each] [--experiments ...]   # renderer memory forensics (lean driver: no DevTools Network)
node visual/memory-detached.qual.js [--gpu amd]       # control: the same session with and without a DevTools Network client
node visual/memory-recorder.qual.js / memory-lifecycle.qual.js   # browser behaviour isolated on a blank page (recorder; workers, WebGL)
node visual/film.js --data <dir> --project <id> --copy [--gpu amd]   # a frame-exact film of a recorded performance, with its music
node visual/lab.js --dataset lumen [--family <id>] [--gpu amd]       # stills of a world on real data, for working on a world
node visual/sidebyside.js / compare.js / recipes.js   # comparison films and sheets; the pinned demonstration recipes
xvfb-run -a node obs/obs.qual.js                      # OBS Studio itself: only in a disposable machine (CI), never on a workstation
node platform/smoke.js                                # the product as processes: receiver, token, restart, pack CLI, integrity
node unit-stress.js --runs 30 [--load 48] [--io 4]    # npm test repeated, optionally under CPU and disk load, full TAP kept
node ui/serve.js [--port 4180] [--empty]              # an isolated installation to review the Control Center (prints a pairing link)
node ui/run-all.js [--jobs 3] [--only home,visual] [--quick]   # the interface: every workspace's suite + the acceptance suite
node ui/acceptance.qual.js [--quick]                  # cross-view acceptance (first run, pairing, projects, OBS, recording, layouts)
node ui/phase11.qual.js                               # the creative workflows through the real Control Center (music, worlds, compositions, export, recording)
node ui/screenshots.js [--gpu amd]                    # review screenshots into docs/control-center/
node ui/workspace-shots.js [--gpu amd] [--out <dir>]  # every workspace at four desktop sizes (default out: docs/desktop/after/)
node ui/world-shots.js [--gpu amd]                    # the flagship worlds on the Stage and in Visual Studio (docs/worlds/spectacle/)
```

The screenshot scripts overwrite the committed sets in `docs/`, which are historical evidence: give `--out` (where
offered) or restore the files afterwards. `--gpu auto|amd|nvidia` renders on a hardware GPU (WSL D3D12 or native ANGLE);
`--gpu amd` / `--gpu nvidia` pin an adapter. Omit it for SwiftShader.

**In CI.** Required on every push: `npm run check`, `npm test`, the VSIX and the platform smoke test on Linux
(`validation`), and on native Windows for pull requests and `main`. Required on every pull request (`qualification`,
headless Chromium with software rendering, at quality 3): the Stage and audio, each reference pack in quick mode, the
pack runtime and recording in quick mode, the interface suites that fit a two-core runner, and the extension in a real
VS Code. The extended tier (`extended-qualification`: full pack suites, long recordings, the one-hour soak, native
Windows browser and VS Code, OBS, the whole interface) runs when a pull request carries the label
`extended-qualification` (or `extended:<job>` for one job), weekly on `main`, or by hand. The real-agent scenario uses
your Claude Code login, is capped with `--max-budget-usd 0.50` and is run by hand only.

## Limitations

What has not been verified, and the known limitations of the current product, are kept in one place:
[docs/OPERATIONS.md](docs/OPERATIONS.md#current-limitations).

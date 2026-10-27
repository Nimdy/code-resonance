# Code Resonance

**Make software development visible—and musical.**

Code Resonance is a completely independent, local-first audiovisual instrument for software creation. An opt-in VS Code extension (and, optionally, an AI agent's hooks) reports observable activity. A loopback receiver records it and interprets it in the background. A performance player turns the project's real structure into an evolving visual world and composes a project-specific score that develops as the software does. No Signal/3 dependency, cloud service, model API, GPU, or Docker is required.

> **Maturity: 0.5.0 (the Creative Control Center), built on the 0.4.0 alpha 1 controlled-alpha candidate; not released: for real developers on real projects, with the limitations in [docs/OPERATIONS.md](docs/OPERATIONS.md); not stable, not production-ready.** Qualified in a real VS Code 1.143 extension host (Linux/WSL2 under Xvfb, and native Windows on GitHub's runners), in headless Chromium (Linux and Windows, software rendering, and an AMD integrated GPU through WSL2), in OBS Studio 32 on Linux (a disposable CI machine), and with a real Claude Code session; see [docs/QUALIFICATION.md](docs/QUALIFICATION.md) for exactly what was run and what was not. **Not yet verified:** macOS, Windows or macOS desktops with a GPU, OBS on Windows or macOS, multi-hour soaks and real sessions with the final code, and human listening and viewing evaluation. The audio is generative synthesis, not a produced master. A replay reconstructs only activity captured after recording began.

## What it does

- **Observes, privately.** File snapshots for analysis, per-second typing *counts* (never typed text), saves, file operations including files written outside the editor (for example by AI agents), diagnostics, VS Code tasks, terminal command lifecycle with a local *category* (test, build, lint, typecheck, install, git, run — never the command text), and Git commits.
- **Interprets meaning, not volume.** A TypeScript/JavaScript AST diff recognises components, routes (file-system routers and Express-style), classes, functions, methods, module-level variables, imports and `require`. Inserting lines or re-running green tests earns nothing; generated bulk saturates; removing code is credited when a later test run validates it; recovering a failing suite is a milestone. Other languages produce file-level events.
- **Represents AI agents honestly.** A Claude Code hook adapter reports prompts (length and fingerprint only), tool use, files touched, subagents and test runs. A file change is attributed to an agent only when it correlates with that agent's own tool event; everything else stays `unknown`. Hidden reasoning is never inferred.
- **Composes.** Each project gets a persistent musical identity (key, mode, progressions, motif, tempo). Long-term progress unlocks layers chapter by chapter; current activity decides how many play; failing validations bring tension, fixes resolve it, substantial milestones lift the next section. Engineering events become short figures on the beat grid; each agent has its own voice. Four palettes: Ambient, Pulse, Cinematic, Chip.
- **Grows a world of its own** (default: *Living*). Each project gets a persistent artistic identity (its Visual Recipe) derived from its code: a galaxy of star systems (Stellar Forge), a bioluminescent forest (Fractal Biosphere) or an engineered city (Machine Cathedral), each with its own geometry, materials, atmosphere, motion, camera and effects. The structures are the real architecture (subsystems, files, symbols, dependencies); the world stays alive between events without inventing progress; validated milestones produce rare, proportional spectacle and lasting change; AI agents appear as presences that follow their observed lifecycle. You can keep, change, regenerate or lock the identity. See [docs/WORLDS.md](docs/WORLDS.md). The Construct ([docs/CONSTRUCT.md](docs/CONSTRUCT.md)) and the earlier worlds (Nexus, Monolith, Nebula) remain available; Monolith is the fallback without WebGL.
- **One clock for sound and image.** Interpretation runs about 10.5 s behind the work; the player schedules every recorded event at its true time on a shared performance clock, so music and visuals coincide and follow the rhythm of the work.
- **Records and replays.** Every interpretation window is appended to a recorded performance timeline. Replay covers the whole history; re-interpreting a journal reproduces the timeline byte-for-byte. A recorded performance can be rendered frame-exact to a film with its music (`qualification/visual/film.js`).

## Quick start

Requires Node.js 20+ and VS Code 1.99+.

```bash
npm start
```

The receiver prints a **pairing link** (`http://127.0.0.1:4174/#pair=…`, single use, valid 15 minutes). Open it in the
browser you use for Code Resonance: it opens the **Creative Control Center** and pairs that browser for good, so it may change settings, identities,
packs and integrations (`npm run pair` prints a new link; VS Code's *Open Code Stage* opens it directly). Without
pairing the application still shows everything, plays and records, but changes nothing. Then click **Enable sound**
(browsers need a gesture before audio). With no project yet, Home shows a short setup guide; `npm run demo` posts a
clearly labelled fictional session. `npm run doctor` checks the setup and says what to fix. Step by step:
[docs/FIRST-RUN.md](docs/FIRST-RUN.md).

### The application

| Workspace | What you do there |
|---|---|
| **Home** | See at a glance whether the receiver runs, which project is active, whether capture is really active, what needs attention; create or continue a composition |
| **Projects** | Browse projects, their identity, statistics, timeline (replay from any moment), agents, validations and exports |
| **Visual Studio** | Choose a world, preview it, customise its parameters (generated from the parameter catalogue and pack manifests), choose a finish (Clean, Cinematic, Dreamlike) and how much the music moves its life, apply; presets |
| **Artist Studio** | Compose your own look from procedural layers (fractals, particle populations, flow fields, structures, atmospheres, lights) over a world or a blank canvas, decide what each responds to (the music, real engineering events, the ecosystem), save versions, apply to a project, export as a data-only pack ([docs/ARTIST-STUDIO.md](docs/ARTIST-STUDIO.md)) |
| **Music Studio** | The composed score's character (mood, evolution, melody, rhythm, atmosphere, harmony, dynamics, space) and the balance of its voices, style, tempo, texture and volume per project or globally, previewed from the next bar; the project's musical identity; presets ([docs/MUSIC.md](docs/MUSIC.md)) |
| **Visual Packs** | Your creations, imported creations and looks, shader packs and coded worlds: import (zip or folder), review and approve code packs, revoke, remove, read their documentation |
| **Connections** | The receiver, VS Code capture and the settings the extension reports, Claude Code hooks, other agents |
| **Record & Broadcast** | Recording profiles and state, the OBS browser source, audio and data exports |
| **Settings** | Global preferences, this device, storage and privacy, diagnostics |
| **Performance Stage** | The world fills the screen; controls appear on movement and fade (press **F** from anywhere) |

How state is shared between the Control Center, the Stage, other windows and the OBS view, and where each setting
lives: [docs/CONTROL-CENTER.md](docs/CONTROL-CENTER.md).

### Install the VS Code extension

```bash
npm run package:vsix                       # Node only; works on Windows, Linux and macOS
code --install-extension code-resonance-0.5.0.vsix
```

Open a trusted workspace, click the **CR** status-bar item (or run **Code Resonance: Start Code Performance**) and accept local capture. The status-bar menu also stops capture and opens the Stage or the OBS view. Capture resumes automatically when VS Code restarts until you stop it.

**WSL / Remote:** the extension runs in the workspace extension host. Start the receiver with Node **inside that host** (e.g. in WSL for a WSL project); Windows reaches it at `http://localhost:4174/` through WSL2's localhost forwarding, with the receiver still on loopback and its token unchanged ([docs/WSL.md](docs/WSL.md)). Never bind the receiver publicly.

### Let an AI agent join (Claude Code)

```bash
npm run hooks:claude -- /path/to/your/project
```

This adds command hooks to `<project>/.claude/settings.local.json` (personal, not committed). Claude Code sessions in that project then appear as their own voices. The adapter never prints and always exits 0, so it cannot block or change Claude's behaviour. Set `RESONANCE_CAPTURE_PROMPT_TEXT=1` only if you explicitly want prompt text stored locally.

Other tools can report through `node scripts/event.js --root <project> --provider <name> --kind agent.tool.completed --tool Edit` (see the script for options). This is an integration surface, not proof that a given product is connected.

### OBS browser source

**Record & Broadcast** builds the URL for the active project and explains the Browser Source settings. Existing
bookmarks keep working:

```
http://127.0.0.1:4174/?overlay=1&sound=1&project=<id>[&labels=stream][&world=living][&style=ambient]
```

The overlay shows only the stage; without `world=`/`style=` it follows the project's saved choices and updates when
they change. OBS's browser allows audio without a click, so `sound=1` starts the music there (enable **Control audio
via OBS**). The OBS view never shows source, file names, prompts, command text or the project's folder name, and never
asks for a control capability. OBS Studio 32 itself was qualified on Linux in a disposable CI machine; on Windows or
macOS, follow the acceptance procedure in [docs/OBS.md](docs/OBS.md).

### Record and export

- **Record** (top bar, Stage, or Record & Broadcast; one recorder, one recording at a time across windows) records what
  the stage shows (the world and its labels, for every world including visual packs) with the music, to WebM in real
  time (Chromium-based browsers; elsewhere the application says recording is unavailable). Profiles: **720p** (the
  default), **1080p** (for a GPU that keeps up) or the stage's own size. The browser saves the file to its downloads
  folder; Code Resonance keeps no copy or library. Details: [docs/RECORDING.md](docs/RECORDING.md).
- **Audio** renders up to 10 minutes of the recorded performance offline to WAV with the current sound settings.
- **Performance data** exports the derived timeline as JSON (no source, paths or prompts).

### Make your own visuals (Visual Pack SDK)

A visual pack changes how a project looks without changing Code Resonance: **declarative** packs (JSON: parameters,
palette, light, technique, effect mapping on a built-in family), **shader** packs (GLSL background and post passes,
procedural effects) and **world** packs (a complete world family). Packs with code run only in a worker inside an
isolated frame, only after you approve their exact files, and are stopped if they fail, hang or are far too slow.
Start with [docs/packs/README.md](docs/packs/README.md) (SDK 1.1; [what changed from 1.0](docs/packs/migration.md)):

```bash
node scripts/pack.js new my-world --kind world --id yourname.my-world
node scripts/pack.js test my-world        # real browser, real recording
```

Then import the folder in **Visual Packs** (or `node scripts/pack.js install my-world` and `approve`): code packs are
installed unapproved and run only after you review their files and digest and allow them.

`packs/examples/` holds the reference packs: Cymatic Field (a fourth world family), Blueprint Cathedral (shader) and
Ember Observatory (declarative).

## How it fits together

```text
VS Code extension ──┐                         ┌── Nexus / Monolith / Nebula (Canvas2D)
  (durable outbox)  ├─▶ receiver ─▶ worker ─▶ ├── composition + Web Audio performer
Agent hooks / CLI ──┘   journal    windows,    └── replay, WebM, WAV export
                        + blobs    AST diff,
                                   evolution ─▶ performance.jsonl (recorded timeline)
```

```text
extension/   capture, durable outbox, shared path and command rules
receiver/    loopback HTTP API, journal + content blobs, cached views
engine/      AST analysis, interpretation (reducer), windowing worker
public/      engine: score (composition), music (synthesis), app (worlds, clock); ui/ the Control Center and Stage
sdk/         performance-frame contract, project identity shared with hooks
scripts/     VSIX packager, demo, generic event CLI, Claude Code hooks, visual pack CLI (pack.js)
packs/       visual pack schema, reference packs, starter templates
qualification/  real VS Code, browser, audio and 30-minute session harnesses
```

Data lives under `~/.code-resonance/` on the machine running the receiver (`RESONANCE_DATA` overrides it, `RESONANCE_PORT` the port); installed visual packs and their approvals under `packs/`. Per project: `events.jsonl` (raw observations, append-only), `blobs/` (compressed snapshots), `performance.jsonl` (recorded timeline, rebuildable), `state.json` and `public.json` (checkpoints).

| Endpoint | Use |
|---|---|
| `GET /health` | Status and timing (window, grace, scan interval) |
| `GET /api/projects` | Projects, most recent first |
| `GET /api/project?id=` | Anonymised graph, stats and recent frames (ETag) |
| `GET /api/timeline?id=&after=&limit=[&fields=intents]` | Recorded performance, paged (`/api/replay` is an alias); `fields=intents` returns only each window's intents |
| `GET /v1/performance/frames?id=&after=` | Versioned performance frames |
| `GET /api/export?id=` | Streamed derived export |
| `POST /v1/events` | Authenticated ingestion (valid events kept, rejections listed) |
| `POST /v1/flush?id=` / `POST /v1/rebuild?id=` | Authenticated: close the open window / re-interpret from the journal |
| `GET /api/recipe?id=[&fallback=1]` | The project's Visual Recipe (with its `revision`); `fallback=1` is the identity without packs |
| `GET /api/packs`, `/api/packs/readme?id=`, `/api/packs/templates` | Installed visual packs (kind, version, digest, files, approval, problems, parameters, usage), READMEs as inert text, starter templates |
| `GET /api/packs/file?id=&path=` | A pack file as inert text (code packs only once approved) |
| `GET /api/settings`, `/api/preferences?id=`, `/api/presets`, `/api/catalog`, `/api/recipe/tunable?id=` | Global settings, a project's preferences, presets, parameter catalogues |
| `GET /api/status`, `/api/evidence?id=`, `/api/integrations` | Receiver health, what was observed per project (capture, reported settings, agents), integrations |
| `GET /api/changes` | Server-sent events: what changed, so every open view converges |
| `GET /pack-frame.html` | The isolated frame code packs run in (no connections allowed) |
| `POST /api/session` | A control capability, for a paired browser only (the pairing key in `receiver-auth.json`) |
| `POST /api/recipe`, `/api/recipe/preview`, `/api/settings`, `/api/preferences`, `/api/presets`, `/api/packs/{import,install,discard,trust,remove}`, `/api/integrations/claude/{plan,apply}` | Administrative: need the control capability (`X-Resonance-Capability`) |

`POST /v1/*` requires the token in `~/.code-resonance/receiver-auth.json`; the same file holds the pairing key. Never expose either in a stream, an issue or a commit.

## Checks

```bash
npm run check          # syntax
npm test               # unit + integration (no dependencies)
npm run package:vsix   # builds the VSIX with Node only
```

Real-environment qualification lives in `qualification/` (its own `npm install`); see [docs/QUALIFICATION.md](docs/QUALIFICATION.md) for the test categories, what CI runs on every pull request, the extended tier, and the evidence.

## Scope and limits

- AST semantics are JS/TS only. Other languages are recorded at file level.
- Source snapshots are opt-in at capture start and enabled by default afterwards for analysis. Files not matching the secret patterns can still contain secrets: use dedicated projects, disable `resonance.captureDocumentContents` when needed, and never share `~/.code-resonance`.
- VS Code cannot see every AI tool. Agents are observed through supported hooks (Claude Code today); other agents' file writes are seen but attributed `unknown`.
- Test success means the observed command exited 0, not that the software is correct.
- The living worlds need WebGL2 (the Construct needs WebGL); without it the player falls back to Monolith. Measured frame rates are in [docs/QUALIFICATION.md](docs/QUALIFICATION.md); native GPU browsers on Windows and macOS have not been measured. The Canvas2D worlds hold 60 fps (Nexus, Monolith) and ~39 fps (Nebula) at 1400 nodes in headless software rendering.
- Independent of `Nimdy/signal3-studio`.

See [SECURITY.md](SECURITY.md), [ARCHITECTURE.md](ARCHITECTURE.md), [docs/AUDIT.md](docs/AUDIT.md) and [docs/QUALIFICATION.md](docs/QUALIFICATION.md).

## Platform notes

- **Windows (PowerShell):** `npm ci --offline`, `npm run check`, `npm test`, `npm start`, `npm run package:vsix` (no Bash or `zip` needed). If PowerShell blocks npm's `.ps1` shim, use `npm.cmd`. On GitHub's Windows runners (no GPU): the unit and integration suite, the platform smoke test, the player in Chromium, a visual pack and the extension in a real VS Code all pass; a Windows desktop with a GPU has not been measured.
- **Linux / WSL2:** qualified in VS Code 1.143 under Xvfb. Run the receiver in the same environment as the extension host.

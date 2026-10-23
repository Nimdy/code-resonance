# Code Resonance

**Make software development visible—and musical.**

Code Resonance is a completely independent, local-first audiovisual instrument for software creation. An opt-in VS Code extension captures observable activity. A loopback receiver records and classifies it without blocking the editor. A separate performance player makes architecture grow into interactive visual worlds and composes an evolving project-specific score. No Signal/3 dependency, cloud service, model API, GPU, or Docker is required.

> **Maturity:** v0.2 prototype. Its architecture, data pipeline, score engine, visual player, source recording and replay work locally and have automated tests. VS Code extension-host behavior and OBS/MediaRecorder capture still require acceptance testing in a real installed environment. Web Audio output is generative synthesizer audio, not a produced master. A project replay reconstructs only activity captured after Code Resonance recording began.

## Features

- **VS Code activity:** baseline scans, actual text document changes, newline edits, saved files, external file-system changes (including changes written by AI tooling), diagnostics, tasks, terminal execution where VS Code exposes it, and observed Git HEAD transitions.
- **Real semantic classification:** TS/JS AST extraction for functions, variables, UI components, routes, imports, call sites and symbols. Weighted milestones distinguish meaningful structural progress from typing noise. Other languages still generate file-level events.
- **AI adapter interface:** opt-in, provider-specific hook ingestion for observable prompts, exposed summaries, tools, and responses. Never pretends to expose models' private internal reasoning. File changes without a provenance trail are attributed **unknown**, not automatically to AI.
- **Reliable local ingest:** a durable disk-backed VS Code outbox, bearer-authenticated loopback service, compressed deduplicated source snapshots, and ~10-second worker-based sorting. The editor never waits for semantic analysis.
- **Three independent visual worlds:** Nexus (living dependency network), Monolith (isometric software architecture), Nebula (organic generative constellation). One shared anonymized structural model drives all three.
- **Own adaptive music engine:** deterministic per-project motifs; Ambient, Pulse, Cinematic, and Chip sound palettes; tempo, texture and volume controls; 16-step quantized bar changes; musical layers expand by chapter, and test outcomes influence harmony. Nothing depends on Signal/3 DSP or ScoreIR.
- **Live / Replay:** a timed activity feed, architecture snapshots for recent windows, time scrubbing at 1×/4×/16×, event JSON export, a clean OBS browser source, and browser-based WebM capture with music when supported.
- **Private by default:** no network telemetry. Raw source stays in the receiver's local storage and is never included in public Stage/event/bridge APIs; published source does not include capture data.

## Quick start

Requires Node.js 20+ and VS Code 1.99+.

```bash
npm start
```

Open **http://127.0.0.1:4174/**. To preview an entirely synthetic 20-event project without VS Code, run in a second terminal:

```bash
npm run demo
```

Choose the resulting project in the top-right project selector and click **ENABLE SOUND** (browsers require an explicit gesture before audio can play). Choose a world and music palette on the left. The Stage updates after semantic sorting, typically in around 10–13 seconds.

### Install the VS Code extension

First build the VS Code extension from this source package with `npm run package:vsix` (requires Bash and `zip`), then install the generated `code-resonance-0.2.0.vsix` file:

```bash
code --install-extension /path/to/code-resonance-0.2.0.vsix
```

Or use **Extensions → … → Install from VSIX…** in VS Code. Open a trusted workspace and run **Code Resonance: Start Code Performance** from the Command Palette. The extension stores unsent events on disk and automatically resumes capture for that workspace after a VS Code restart until you run **Code Resonance: Stop Code Performance**.

**WSL / Remote:** the extension runs in the workspace extension host. Start the receiver with Node **inside that host**, e.g. WSL for a WSL project. Expose port 4174 to the Windows browser with VS Code port forwarding if needed. Do not bind the server publicly. No test workload needs to run on the developer's editing workstation; the server's semantic interpretation runs in its own worker thread.

### OBS browser source

Use **OBS VIEW ↗** or point an OBS Browser Source to `http://127.0.0.1:4174/?overlay=1` (recommended 1920×1080). The clean view hides panels/controls and displays only the evolving world. Enable player audio in a regular browser and route that browser's audio to OBS; whether OBS's own embedded browser can capture audio depends on your OBS configuration. The Stage never includes raw source or prompts.

### Record a performance

Click **RECORD** in the normal player (Chrome/Chromium with MediaRecorder). The player combines the canvas and its own Web Audio output into a downloadable `.webm` recording. Press **STOP** to finish. This is a real-time recording of what you see and hear, not an offline rendering engine; playback at accelerated replay speeds changes the visual timescale but doesn't resample the underlying score.

### Explicit agent hook

An AI tool can emit events through a *supported, authorized* hook:

```bash
node scripts/event.js --root /absolute/path/to/project \
  --provider codex --kind agent.prompt.submitted --text 'Build a typed HTTP handler'
node scripts/event.js --root /absolute/path/to/project \
  --provider codex --kind agent.tool.started --tool Edit
node scripts/event.js --root /absolute/path/to/project \
  --provider codex --kind agent.tool.completed --tool Edit
```

Prompt text is fingerprinted and counted, **not saved**, unless `--include-text` is explicitly requested. Avoid secrets in command-line arguments; prefer `--stdin`. This CLI is a portable integration *surface*, not proof that any external AI product is connected.

## Architecture

```text
extension/         Workspace capture, VS Code lifecycle hooks, durable outbox
receiver/          127.0.0.1 HTTP receiver, source blob journal, derived-only API
engine/            TypeScript AST analysis, provenance, weighted project evolution
public/            Independent Canvas2D visual worlds, Web Audio sequencer, UI
sdk/               Versioned bounded public performance-frame validator
scripts/           Synthetic demo, standalone AI event hook, VSIX packager
vendor/            Local TypeScript parser with its upstream license
.github/workflows/ Minimal syntax + unit/integration CI
```

Data is stored under `~/.code-resonance/` on the machine where the receiver runs. The service can be controlled with `RESONANCE_PORT` and `RESONANCE_DATA` for isolated tests. The receiver accepts writes only from authenticated clients and listens on 127.0.0.1 by default.

The derived APIs are:

| Endpoint | Use |
|---|---|
| `GET /health` | Receiver status |
| `GET /api/projects` | Available project identities |
| `GET /api/project?id=...` | Sanitized project graph, stats and music frames |
| `GET /api/replay?id=...` | Recent architecture snapshots for replay |
| `GET /v1/performance/frames?id=...` | Versioned, bounded audio/visual performance controls |
| `GET /api/export?id=...` | Sanitized cue + performance export JSON |
| `POST /v1/events` | Authenticated event ingestion |
| `POST /v1/flush?id=...` | Authenticated deterministic sorter flush |

`POST` requires the token in `~/.code-resonance/receiver-auth.json`. Never expose that token in a stream or commit it to Git.

Run acceptance checks:

```bash
npm run check
npm test
npm run package:vsix
```

## Scope and limits

- Current AST classification is strongest for JavaScript/TypeScript. Other languages are planned.
- Source snapshots are opt-in at capture start, but **currently enabled by default within the trusted-workspace flow** to support AST analysis. Files that are not explicitly excluded can contain secrets. Use dedicated projects for testing, disable content snapshots in extension settings when appropriate, and never upload `~/.code-resonance`.
- Replay graphs are currently bounded to the latest **160 interpretation windows**; journal events remain on local disk but full multi-month visual reconstruction is not yet implemented.
- VS Code cannot universally intercept every third-party AI chat, AI prompt, thinking trace, or terminal command. Capture is limited to supported VS Code events and explicitly integrated hooks.
- Test passes are events, **not a claim that the application is correct**. Baseline code is indexed, not rewarded as newly written work.
- Canvas2D works without a GPU; a future WebGPU renderer may be added behind the same public graph/event contract.
- This repository is entirely independent of `Nimdy/signal3-studio` and changes nothing in that project.

See [SECURITY.md](SECURITY.md) and [ARCHITECTURE.md](ARCHITECTURE.md) for the boundaries and threat model.


## Platform installation (complete source ZIP)

This distribution contains the entire **source**, not a prebuilt VSIX. All application source files are ordinary `.js`, `.html`, `.css`, `.json`, and `.md`; there is no TypeScript application compilation step and no `tsconfig.json` is needed. The TypeScript language parser used by the sorter is already vendored in `vendor/typescript.js`, together with its license. Neither Signal/3 Studio nor any cloud API is required.

### Windows 10/11 (PowerShell)

1. Install **Node.js 20 or newer** (Node.js 22 recommended) and **VS Code 1.99 or newer**. Extract the ZIP, keeping its `code-resonance/` directory intact.
2. Open PowerShell in that directory and run:

   ```powershell
   npm ci --offline
   npm run check
   npm test
   npm start
   ```

   `npm ci --offline` is supported because the project declares no external runtime npm dependencies. If PowerShell blocks npm's `.ps1` shim, use `npm.cmd` instead (for example `npm.cmd test`); there is no need to weaken the PowerShell execution policy.
3. Visit `http://127.0.0.1:4174/` in a browser and click **ENABLE SOUND** after opening the page. In a second PowerShell window, run `npm run demo` to generate synthetic activity.
4. To **build the extension on Windows**, use **Git Bash** with `zip` available, or a WSL shell, and run `npm run package:vsix` from the project root. This one Bash-based packaging script is not natively PowerShell-compatible. The resulting `code-resonance-0.2.0.vsix` can be installed using VS Code's *Extensions → ... → Install from VSIX...*, or `code --install-extension .\code-resonance-0.2.0.vsix` from PowerShell.

### Linux (including WSL2)

1. Install Node.js 20+ and (to package the extension) `bash`, `zip`, and `unzip`; install VS Code 1.99+ when using the extension.
2. Extract the ZIP and run:

   ```bash
   cd code-resonance
   npm ci --offline
   npm run check
   npm test
   npm start
   ```

3. Open `http://127.0.0.1:4174/` and in a second terminal run `npm run demo`. Build the extension with `npm run package:vsix`, then install using `code --install-extension ./code-resonance-0.2.0.vsix` (or VS Code's VSIX installer).

### Workspace/receiver placement

The extension runs in the **workspace extension host**, not necessarily on the machine displaying the VS Code interface. For normal Windows projects run `npm start` on Windows; for VS Code Remote–WSL/SSH projects run the receiver **inside the Linux/remote host** with Node available, then forward port 4174 if you want to view the player from the desktop. Run the extension command **CODE RESONANCE: Start Code Performance** only after opening a trusted project. Raw source capture is opt-in to the recording workflow, enabled by default after Start, and can be disabled using `resonance.captureDocumentContents`.

### Controls and storage

The listener binds to loopback (`127.0.0.1:4174`) and uses local authentication for write requests. `RESONANCE_PORT` selects an alternative port; `RESONANCE_DATA` selects an alternative persistent data directory (default `~/.code-resonance/` on the receiver machine). Do not put receiver data, tokens, or secrets into a shared directory, Git checkout, or OBS source. The Stage does not publish raw captured source. Public viewer endpoints have only derived structural data.

### Packaging verification

`FILE_TREE.txt` lists every file delivered in this ZIP and `MANIFEST.sha256` lists SHA-256 hashes of every **other** packaged file (the manifest necessarily excludes itself to avoid a recursive checksum). `VALIDATION_REPORT.md` records the actual build/test results and untested runtime surfaces. Generated `.vsix` files, `node_modules`, repository history, local receiver data, `.env` files, caches, and media recordings are intentionally excluded.

# Operations

Running Code Resonance day to day: where its data lives, how to back it up, update it and roll it back, what the
receiver prints, and what has and has not been verified. Setting it up for the first time: [FIRST-RUN.md](FIRST-RUN.md).

## Status

Product version **0.5.0**, not released: for private use on your own machine. It is not stable and has no installer;
it runs from this repository. The product version is separate from the versions of the data formats, the score, the
Visual Recipe generator and the Visual Pack SDK ([ARCHITECTURE.md](../ARCHITECTURE.md#versions-and-compatibility)).

## Supported environments (what was actually tested)

| Environment | Receiver, tests | Extension in VS Code | Control Center, worlds | Recording | OBS |
|---|---|---|---|---|---|
| Linux / WSL2 (Ubuntu 24.04), AMD integrated GPU through WSL2 | ✓ | ✓ (VS Code 1.143, Xvfb) | ✓ (flagship worlds at 1920×1080: about 42–58 fps at Auto quality) | ✓ 720p at 30 fps, qualified with the worlds of PR #6; since then checked as working (picture and sound). 1080p not qualified for the built-in worlds | not run |
| Linux, software rendering (GitHub's runners) | ✓ | ✓ | functional; the built-in worlds are slow | functional only, at the stage's size | ✓ OBS 32.2, no GPU |
| Windows (GitHub's runners, no GPU) | ✓ | ✓ (VS Code 1.143.1) | functional (the Stage in Chromium) | functional only | not run |
| Windows or macOS desktop with a GPU | not tested | not tested | not tested | not tested | not tested |
| macOS (any) | not tested | not tested | not tested | not tested | not tested |
| Firefox, Safari | — | — | not tested | no: recording needs a Chromium-based browser | — |

A Windows browser or OBS on Windows reaching a receiver inside WSL2 has not been tested; [WSL.md](WSL.md) has the
procedure to check it. The measurements behind each mark are in [QUALIFICATION.md](QUALIFICATION.md).

## Current limitations

- **Platforms:** only the environments above. Visual pack isolation was probed in Chromium only.
- **Long sessions:** no multi-hour soak has completed with the final code, and no multi-hour real development session
  has been recorded (the longest runs: 110 minutes locally and one hour in CI, both before the flagship worlds).
- **Recording** keeps the file in the browser's memory until you stop: about 60 MB a minute at 720p and 90 MB at
  1080p. Use OBS for anything longer than about half an hour. At 1080p the built-in worlds need a capable GPU; on
  software rendering they record at a few frames a second. Details: [RECORDING.md](RECORDING.md).
- **Listening and viewing:** the owner has reviewed the application, its worlds, the digital-life films and the
  creative direction. No one else has, and whether the music stays pleasant through hours of work is not established.
- **Interpretation:** TypeScript and JavaScript are analysed in depth, Python and manifests partly, other languages
  at file level. AI agents other than Claude Code can report only through `scripts/event.js`.
- **Labels at the edge:** a label that follows a moving object can be cut by the frame's edge, on screen and in
  recordings.
- **Three catalogued values have no visible effect on one world each:** *Reactivity* (`music.reactivity`) on Machine
  Cathedral, *Beat pulse* (`music.beatPulse`) and *Blossom scale* (`secondary.blossomScale`) on Fractal Biosphere. The
  Visual Studio and the Music Studio still offer them. They stay in the parameter catalogue so that saved recipes and
  packs that set them remain valid; making them work would change the approved look of those worlds.
- **Digital life:** images are identical across runs only on the same GPU and driver. A replay hands its ecosystem to
  the next generation every 10 minutes, visible as a short breath. Not run on Windows or in OBS.
- **The Music Studio and the Artist Studio** were not run on Windows, macOS or in OBS, nor with a composition through a
  live session longer than a few minutes.
- A replay reconstructs only what was captured after capture began.

## Where data lives

Everything is on the computer that runs the receiver, in its data directory: `~/.code-resonance` by default
(`%USERPROFILE%\.code-resonance` on Windows). `RESONANCE_DATA` or `npm start -- --data <dir>` chooses another one.

| Path in the data directory | What | If you delete it |
|---|---|---|
| `receiver-auth.json` | the ingestion token, the pairing key, the last port (mode 0600 outside Windows) | a new token and key; the extension reconnects, browsers must pair again |
| `settings.json` | global preferences | the defaults |
| `presets.json` | visual and music presets | presets are gone |
| `compositions.json` | the Artist Studio's compositions, each with its last five versions | compositions are gone (a project that applied one keeps its copy in its recipe) |
| `packs/<id>/`, `packs/trust.json` | installed visual packs, digest-bound approvals | packs or approvals are gone |
| `packs/.quarantine/` | imports waiting for review | emptied at every start anyway |
| `projects/<hash>/events.jsonl`, `blobs/` | the journal of observations and the compressed source snapshots: the source of truth | the project's history is gone |
| `projects/<hash>/performance.jsonl`, `state.json`, `public.json` | the recorded timeline and its checkpoints, derived from the journal | rebuilt from the journal |
| `projects/<hash>/evidence.json` | what capture was observed, derived from the journal | rebuilt from the journal |
| `projects/<hash>/recipe.json`, `preferences.json` | the project's visual identity and its own choices | a new identity is generated by today's generator; the global choices apply |
| `projects/<hash>/salt` | the secret behind the project's public ids | ids change; keep it with the journal |
| `spool/` | agent hook events waiting for the receiver | those events are lost |

The VS Code extension always reads the token from `~/.code-resonance/receiver-auth.json`, so a receiver started with
another data directory receives nothing from it. Another directory suits the demonstration, tests and the qualification
(`RESONANCE_DATA` applies to `npm run demo`, `doctor`, `pair`, `scripts/pack.js` and the Claude Code hooks too).

Outside it: the VS Code extension's outbox (events waiting for the receiver) in VS Code's global storage
(`…/globalStorage/zerobandwidth.code-resonance/outbox`); each browser keeps its pairing key, the active project and a
few interface choices for the receiver's address ([SECURITY.md](../SECURITY.md)). Which setting lives where:
[CONTROL-CENTER.md](CONTROL-CENTER.md#where-configuration-lives), and Settings › Storage & privacy in the Control
Center, which also shows a paired browser this receiver's data directory.

## Recordings, exports and films

- **Record**, the **Audio** (WAV) and **Performance data** (JSON) exports and an Artist Studio **Export** (zip) are
  saved by the browser to its downloads folder. Code Resonance keeps no copy and no library.
- **Films** (`qualification/visual/film.js`) are written to `qualification/results/visual/` in your checkout unless
  `--out` says otherwise (never committed), each with the recipe it used next to it.

## Backup

Stop the receiver, then copy the whole data directory. The journal (`events.jsonl`), the snapshots (`blobs/`) and each
project's `salt` are what cannot be recreated; recipes, preferences, settings, presets, compositions, packs and
approvals are your choices. Everything else is rebuilt from the journal. The data directory holds your source
snapshots and the receiver's token: keep the copy as private as the original.

## Receiver lifecycle

`npm start` runs the receiver in the foreground on `127.0.0.1:4174` (`RESONANCE_PORT` or `npm start -- --port <port>`
changes the port); stop it with Ctrl+C. It needs no network and serves only loopback.

While it is stopped, nothing is lost: the extension's outbox keeps events on disk and delivers them when the receiver
returns, and agent hooks keep theirs in `spool/`. After a restart, frames appended after the last checkpoint are
regenerated identically. Pairing survives restarts; capabilities (what a paired browser uses to change things) are
renewed automatically.

## Logs and diagnostics

- **The receiver's output.** `[CODE RESONANCE]` lines at start (address, data directory, a pairing link);
  `[sorter] Rebuilding <id> interpretation vX -> vY` when a project's derived files are rebuilt; `[resonance store]
  <file> is invalid …; using the defaults` when a configuration file cannot be read (the next change saved first copies
  it to `<file>.invalid`, then writes a valid one); `[resonance receiver]` for a failed request.
- **`npm run doctor`** checks Node, the receiver, its token and its permissions, projects, packs waiting for approval,
  and WSL2 networking. It is read-only and never prints the token or the pairing key. `--json` for a machine-readable
  report; `--data` and `--port` for another installation.
- **Settings › Diagnostics** in the Control Center shows what this window sees (receiver, browser, world, sound,
  recording) and copies it as JSON without tokens, folders, project names or ids.
- `GET http://127.0.0.1:4174/health` answers `{"ok":true,…}` with the version while the receiver runs.

## Updating from an earlier development version

Stop the receiver, update the checkout (`git pull` on `main`), start it again with `npm start`. The application has no
runtime dependencies to install. Rebuild the extension (`npm run package:vsix`) and install the new VSIX over the old
one.

On the first start the receiver adapts what it finds, and nothing you made is rewritten:

- A receiver from before 0.5 had no pairing key: one is created, and browsers pair once with the printed link.
- A browser's player choices from before 0.5 move to the receiver once.
- If the interpretation version differs from the one a project was built with, its derived files are rebuilt from the
  journal (the journal itself is never rewritten). It has been 7 since the living worlds.
- **Identities keep their look and sound.** A project's saved identity keeps the classic score (v2), the Classic finish
  and ecology 1 (or no digital life) until you change them: *Use the composed score* in the Music Studio, *Use the
  Phase 11 finish* (and ecology) and the *Digital life* switch in the Visual Studio. Each is an ordinary tuning you
  can reset.

## Rollback

- **Extension:** install the previous VSIX, or `code --uninstall-extension zerobandwidth.code-resonance`.
- **Receiver:** stop it, back up the data directory, check out the earlier version and start it. The journal keeps its
  format, and derived files are rebuilt whenever the interpretation version differs, in either direction. An earlier
  version ignores files it does not know, such as `compositions.json`. Whether an earlier version reads
  recipes and settings written by this one has not been tested: keep the backup until you are sure.
- **Visual packs:** `node scripts/pack.js revoke <id>` or `remove <id>`, or Revoke and Remove in Visual Packs.
- **A look or a composition:** Visual Studio's *Reset customisations*; an Artist Studio composition's **Versions**
  restores one of its last five saves.

## Windows and WSL2

Run the receiver on the same side as the VS Code extension host: inside WSL for a WSL workspace, in Windows for a
Windows folder. A Windows browser reaches a receiver in WSL2 at `http://localhost:4174/` through WSL2's localhost
forwarding, with the receiver still on loopback: [WSL.md](WSL.md). In PowerShell, if npm's script shim is blocked, use
`npm.cmd` (for example `npm.cmd start`). Never set `RESONANCE_ALLOW_REMOTE=1` to make it reachable.

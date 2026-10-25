# Code Resonance 0.4.0 alpha 1: installing, what is supported, what to test

Code Resonance is in **controlled alpha**: real developers trying it on real projects, with known limitations listed
below. It is not stable and not production-ready. Nothing leaves your machine: no account, no cloud service.

## Install and use

Requirements: Node.js 20 or later (22 recommended), VS Code 1.99 or later, a Chromium-based browser (Chrome or Edge)
for the player and recording. A GPU is recommended for the living worlds.

1. **Receiver.** In the Code Resonance folder: `npm start` (listens on `127.0.0.1:4174`, data in `~/.code-resonance`).
   `npm run doctor` checks the setup and says what to fix.
2. **Extension.** `npm run package:vsix`, then `code --install-extension code-resonance-0.4.0.vsix`.
3. **Capture, with consent.** Open a trusted workspace, click **CR** in the status bar (or run *Code Resonance: Start
   Code Performance*) and accept local capture. Capture resumes when VS Code restarts until you stop it.
4. **Player.** Open `http://127.0.0.1:4174/`, click **ENABLE SOUND**. The performance follows your work about 10 s
   behind.
5. **World and music.** Choose a world (*Living* by default) and a musical style (Ambient, Pulse, Cinematic, Chip).
6. **Visual Recipe.** The **World DNA** panel shows the project's identity: keep it, choose another family or a visual
   pack, regenerate, lock it; set **Quality** if frames are slow.
7. **Visual pack.** `node scripts/pack.js install <folder>`; a pack with code needs your approval of its exact files:
   **REVIEW** in World DNA, or `node scripts/pack.js approve <id>`.
8. **Record.** Choose the **recording size** (720p by default, 1080p if your GPU keeps up, or the stage's size) and
   press **● RECORD**; the WebM file downloads when you stop. For more than about half an hour, use OBS.
9. **Replay and export.** **REPLAY** plays the whole recorded history; **AUDIO ↓** renders up to ten minutes to WAV;
   **DATA ↗** exports the derived timeline.
10. **OBS.** **OBS VIEW ↗** gives the overlay URL; add it as a Browser Source (1920×1080, *Control audio via OBS*).
    See [OBS.md](OBS.md).

Details and troubleshooting: [FIRST-RUN.md](FIRST-RUN.md). WSL2: [WSL.md](WSL.md). Recording: [RECORDING.md](RECORDING.md).
Visual packs: [packs/README.md](packs/README.md). Security and privacy: [../SECURITY.md](../SECURITY.md),
[packs/security.md](packs/security.md).

## Supported environments (what was actually tested)

| Environment | Receiver, tests | Extension in VS Code | Player and worlds | Recording | OBS |
|---|---|---|---|---|---|
| Linux / WSL2 (Ubuntu 24.04), AMD integrated GPU via WSL2 | ✓ | ✓ (VS Code 1.143, Xvfb) | ✓ 60 fps (Chromium) | ✓ 720p qualified (30 fps, sync); 1080p: packs 30 fps, built-in worlds 25-28 (not qualified) | — |
| Linux, software rendering (GitHub runners) | ✓ | ✓ | functional (packs ~60 fps, built-in worlds slow) | functional only (stage size; a pack at 720p) | ✓ OBS 32.2 (no GPU) |
| Windows (GitHub runners, no GPU) | ✓ | ✓ (VS Code 1.143.1) | functional | functional only | — |
| Windows or macOS desktop with a GPU | not tested | not tested | not tested | not tested | not tested |
| Firefox, Safari | — | — | not tested | no (Chromium only) | — |

## Known limitations

- **Platforms:** qualified on Linux/WSL2 with an AMD integrated GPU, and on GitHub's Linux and Windows runners (software
  rendering). Not tested: macOS; Windows or macOS desktops with a GPU; OBS on Windows or macOS; Firefox and Safari
  (not tested; recording needs a Chromium-based browser, and pack isolation was probed in Chromium only).
- **Recording at 1080p** needs a capable GPU: on the AMD integrated GPU used for testing, the built-in worlds record at
  about 23-29 frames a second at 1080p (visual packs at 30); 720p, the default, holds 30 for every world. The player
  says so when a recording cannot keep up and suggests 720p or a lower Quality. On software rendering (machines without
  a GPU) the built-in worlds record at a few frames a second.
- **Recording memory:** the browser keeps the recording in memory until you stop it: about 60 MB a minute at 720p and
  90 MB at 1080p (1.5-1.7 times the file, which grows 35-37 and 50-61 MB a minute). For sessions longer than about half
  an hour, record with OBS.
- **Long sessions:** sessions of many hours have not been completed with the final code (the longest runs: 110
  minutes locally, one hour in CI, and a 30-minute activity soak with the final code). Memory growth seen in earlier
  soaks is explained and its cause fixed (`docs/QUALIFICATION.md`); a world or pack switch still leaves about 0.3 MB.
- **Artistic and listening acceptance** of the worlds, packs and music has not been done by people yet: that is what
  this alpha is for.
- **Interpretation:** TypeScript/JavaScript are analysed in depth, Python and manifests partly, other languages at file
  level. AI agents other than Claude Code report only through the generic event script.
- **The extension** captures only after explicit consent in a trusted workspace; capture resumes after a VS Code restart
  until you stop it.

## Security and privacy, in short

Everything stays on your machine: the receiver listens on loopback only (127.0.0.1) and accepts events only with a
local token; there is no account, telemetry or cloud service. Typed text is never captured (per-second counts only); terminal commands are
reduced to a local category; prompt text is not stored unless you opt in. The Stage, OBS view, films and recordings
never show source code, file names, paths, prompts, commands or the project folder name (only a public title you set).
Visual packs with code run in an isolated frame and worker with no network and no access to the player, only after you
approve their exact files (a digest), and are stopped if they fail, hang or are far too slow. What a browser cannot
promise (GPU shaders, side channels) is written down in [packs/security.md](packs/security.md). Full model:
[../SECURITY.md](../SECURITY.md).

## Recording: which path

- **● RECORD** (Chrome or Edge): short clips and demos, 720p or 1080p, the music included; the file downloads when you
  stop. Up to about half an hour.
- **OBS** (Browser Source on the OBS VIEW URL, *Control audio via OBS*): streaming and long sessions; memory does not
  grow with the length. See [OBS.md](OBS.md).
- **Films** (`qualification/visual/film.js`): frame-exact renders of a recorded performance, for demonstrations.

## Packaging (reproducible)

```bash
npm ci                     # the product has no runtime dependencies; this installs nothing at the root
npm run check && npm test  # syntax and the unit/integration suite
npm run package:vsix       # code-resonance-0.4.0.vsix, built with Node only
```

The receiver and player run from the repository (`npm start`). The qualification harnesses live in `qualification/`
with their own `npm ci`.

## Rollback

- Extension: `code --uninstall-extension zerobandwidth.code-resonance`, or install the previous VSIX.
- Receiver: stop it and check out the previous version. The journal (the raw events, the source of truth) keeps its
  format: since 0.3.0 events may carry one more optional field (`from`, a rename's source), which older versions ignore.
  Everything derived from it is rebuilt from the journal when the interpretation version differs, in either direction
  (v7 in 0.4.0, v4 in 0.3.0; the receiver logs "Rebuilding … interpretation"). Visual Recipes (each project's `recipe.json`) and
  installed packs (`packs/`, with `packs/trust.json`) are files 0.3.0 does not know and leaves alone; they are used again
  after upgrading.
- Visual packs: `node scripts/pack.js revoke <id>` or `remove <id>`.

## Alpha acceptance checklist (before handing it to testers)

- [ ] Required CI green on the release commit (Linux, Windows, reference packs, runtime)
- [ ] Extended tier run once on the release commit (OBS, Windows browser and VS Code, full pack suites)
- [ ] `npm run package:vsix` produces `code-resonance-0.4.0.vsix`; installing it in a clean VS Code profile works
- [ ] `npm start` + `npm run doctor` on a clean machine report no problem
- [ ] A one-hour live session with a real project: events captured, music and worlds running, a 1080p recording made
- [ ] Known limitations below read by the tester before starting
- [ ] Owner's approval to merge and tag `v0.4.0-alpha.1`

## What the alpha should find out (from people, not tests)

- Can someone install it without help?
- Does it capture their project accurately (structure, events, agents)?
- Does their chosen world stay visually interesting through a session?
- Does the music stay pleasant through a real coding session?
- Can they record and stream it?
- Do they come back to it?
- Can an artist make a visual pack from the documentation alone?

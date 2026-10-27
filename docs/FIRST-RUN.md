# First run

From nothing to a project you can watch, hear, record and stream. About ten minutes.

## 1. Start the receiver

Node.js 20 or later.

```bash
npm start
```

It listens on `http://127.0.0.1:4174` (loopback only) and keeps its data in `~/.code-resonance` (`RESONANCE_DATA` and
`RESONANCE_PORT` change both). Check it at any time:

```bash
npm run doctor
```

The doctor is read-only: it reports Node, the receiver, its token, the projects received, visual packs waiting for
approval and, inside WSL2, how to reach the player from Windows.

## 2. Open the player

**http://127.0.0.1:4174/**, then **ENABLE SOUND** (browsers need a click before audio). With no project yet, run
`npm run demo` in a second terminal: it posts 20 fictional events.

## 3. Connect VS Code

```bash
npm run package:vsix
code --install-extension code-resonance-0.4.0.vsix
```

Open a trusted workspace, click **CR** in the status bar (or **Code Resonance: Start Code Performance**) and accept
local capture. The project appears in the player's selector within seconds; the performance runs about 10 s behind your
work (interpretation needs a little hindsight). Capture resumes when VS Code restarts until you stop it from the same
menu. For WSL or remote workspaces see [WSL.md](WSL.md).

Optional: let Claude Code join as its own voice, `npm run hooks:claude -- /path/to/project`.

## 4. Choose how it looks

The **World DNA** panel shows the project's identity (its Visual Recipe): keep it, choose another family or a visual
pack, regenerate, or lock it. **Quality** sets the rendering level: *Auto* adapts to your machine (it lowers quality
when frames are slow and climbs back); *High*, *Medium · no MSAA*, *Low · 75 %* and *Lowest · 55 %* fix it.

Visual packs with code (shader and world packs) run only after you approve their exact files (**REVIEW** in the panel,
or `node scripts/pack.js approve <id>`). If one misbehaves (an error, no answer for 6 s, too slow, a lost GPU context)
the player stops it, says why, and shows the identity without it; **RETRY** runs it again. Nothing restarts on its own.

## 5. Record

**● RECORD** records what the stage shows (the world and its labels, for every world and every kind of pack) together
with the music, to a WebM file, until you press **■ STOP** (the button shows the elapsed time, and *NO SOUND* if the
music could not be captured). The file downloads when you stop, or when a pack is stopped while recording. Chromium-based
browsers (Chrome, Edge) and OBS support it; elsewhere the player says recording is unavailable. The browser keeps the
recording in memory until you stop (about 45 MB per minute: 6 Mbit/s measured); for sessions longer than about half an
hour, record with OBS instead. If the sound stops reaching the recording (an audio device disconnected or stalled), the
browser's recorder would stall the whole file, so the player finishes and saves the recording at that moment and says
why.

The recording contains the stage only: no source, file names, paths, prompts, command text or the receiver's token.
The stage shows the project's public title (your project's folder name is never shown) and subsystem names you chose.

**AUDIO ↓** renders up to ten minutes of the recorded performance to WAV, offline and deterministic.

## 6. Stream with OBS

**OBS VIEW ↗** opens the overlay (`?overlay=1&sound=1&project=<id>&world=living`). In OBS add a **Browser Source**
with that URL at 1920×1080 and tick **Control audio via OBS**. Acceptance procedure and what has been verified:
[OBS.md](OBS.md).

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| The player page does not load | receiver not running, or another port | `npm run doctor`; start it with `npm start` |
| No project appears | capture not started, or the extension cannot reach the receiver | CR status-bar item → Start; `npm run doctor` shows the port the receiver uses; the extension's port setting is `resonance.receiverPort` |
| Events arrive late | by design: interpretation runs ~10 s behind the work | wait; the replay has everything |
| No sound | the browser needs a click; or the tab is muted | **ENABLE SOUND**; check the tab's audio |
| Recording says *NO SOUND* | sound was off or the audio output could not be captured | enable sound first, then record |
| ● RECORD says recording is unavailable | the browser lacks MediaRecorder or canvas capture | use Chrome or Edge |
| *Recording finished early (the sound stopped …)* | the audio device was disconnected or stopped working | reconnect it, check that you hear the music, record again |
| *… stopped: the pack stopped answering* | a visual pack hung or was too slow for this machine | lower **Quality**, then **RETRY**; or choose another look |
| *… exceeds its declared budget* | the pack draws more than its author declared | it keeps running; lower Quality if frames are slow |
| *… contains code and is not approved* | a shader or world pack waits for your approval | **REVIEW** in World DNA, or `node scripts/pack.js approve <id>` |
| *… files changed after approval* | an installed pack's files were modified | reinstall it (`node scripts/pack.js install <folder>`) and approve again |
| Black or frozen world | no WebGL2 (the player falls back), or a GPU driver problem | try another browser; set Quality to Low |
| Windows cannot open the player of a receiver in WSL | localhost forwarding off | [WSL.md](WSL.md) |
| In OBS the Construct shows instead of the living world | OBS's browser has no WebGL (typically no usable GPU with hardware acceleration on) | OBS → Settings → Advanced → turn off *Browser Source Hardware Acceleration*, restart OBS |

Your data stays in `~/.code-resonance`; nothing leaves the machine. Never share that folder or its token.

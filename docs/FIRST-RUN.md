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

## 2. Open the Control Center

`npm start` prints a **pairing link**: `http://127.0.0.1:4174/#pair=…` (single use, 15 minutes). Open it in the browser you use for Code
Resonance. It opens the **Control Center** (Home) and pairs that browser once, so it may change settings, visual
identities, music, packs and integrations. `npm run pair` prints a new link whenever you need one. A browser opened
on `http://127.0.0.1:4174/` without the link can watch, play and record, and says **View only · Pair this browser**.

Click **Enable sound** (browsers need a click before audio). With no project yet, Home shows a short setup guide that
follows what has really happened (receiver, VS Code, first project, sound, Stage); `npm run demo` in a second terminal
posts a fictional session, always labelled *Demonstration (fictional)*.

## 3. Connect VS Code

```bash
npm run package:vsix
code --install-extension code-resonance-0.5.0.vsix
```

Open a trusted workspace, click **CR** in the status bar (or **CODE RESONANCE: Start Code Performance**) and accept
local capture. The project appears in the player's selector within seconds; the performance runs about 10 s behind your
work (interpretation needs a little hindsight). Capture resumes when VS Code restarts until you stop it from the same
menu. For WSL or remote workspaces see [WSL.md](WSL.md).

Optional: let Claude Code join as its own voice, `npm run hooks:claude -- /path/to/project`.

Connections shows what the receiver has actually observed: whether VS Code capture is running (from its capture
start and recent activity; VS Code does not report closing, so a quiet session is shown as unknown), the capture
settings the extension reported (0.5 and later), and Claude Code activity. Those settings are changed in VS Code; the
page links there. The Claude Code hooks can also be added or removed from Connections: it shows the exact change to
`<project>/.claude/settings.local.json` before writing it.

## 4. Choose how it looks and sounds

**Visual Studio** shows the project's identity (its Visual Recipe) and the worlds it can take: choose a world, see it
on the stage as a preview (*Preview · not saved*), customise its parameters (spectacle, motion, information on the
stage, the public title, subsystem names, and every genome parameter of the family or pack), then **Apply** — or
**Cancel**, and nothing changed. Customising locks the identity; *Reset customisations* returns to the generated
values. Visual presets save a look you want to reuse on other projects.

**Music Studio** sets the style (Ambient, Pulse, Cinematic, Chip), tempo (the project's own or manual), texture and
volume, for this project or as the global default; changes are heard on the next bar and saved only when you apply.

**Quality** (Settings › This device, or on the Stage) sets the rendering level of this machine: *Auto* adapts (it lowers
quality when frames are slow and climbs back); *High*, *Medium · no MSAA*, *Low · 75 %* and *Lowest · 55 %* fix it.

**Visual Packs** installs packs from a `.zip` or a folder (nothing is downloaded from the internet). Packs with code
(shader and world packs) are installed unapproved and run only after you review their exact files and digest and
**Allow this code**. If one misbehaves (an error, no answer for 6 s, too slow, a lost GPU context) it is stopped, the
reason is shown, and the identity continues without it; **Retry** runs it again. Nothing restarts on its own.

## 5. The Performance Stage

**Stage** (top bar, rail, or **F** anywhere) shows the world alone. Controls appear when you move the pointer and fade
after a moment: live or replay, play and scrub, speed, information (Cinematic, Explorer — click the world to inspect it
—, Stream, Off), world, quality, sound, record, full screen (**F**), and a button to open the Stage in a new window for
a second monitor. The Stage shows the project's public title only, never its folder name.

## 6. Record

**Record** (top bar, Stage, or **Record & Broadcast**) records what the stage shows (the world and its labels, for every
world and every kind of pack) together with the music, to a WebM file, until you stop it. Profiles: **720p** (the
default), **1080p** (sharper; the built-in worlds may not hold 30 fps on an integrated GPU) or the stage's size. Only
one window records at a time. The file downloads when you stop, or when a pack is stopped while recording.
Chromium-based browsers (Chrome, Edge) and OBS support it; elsewhere the application says recording is unavailable. The
browser keeps the recording in memory until you stop (about 45 MB per minute); for sessions longer than about half an
hour, record with OBS. If the sound stops reaching the recording (an audio device disconnected or stalled), the
recording is finished and saved at that moment, with the reason. Code Resonance keeps no copy or library of recordings.

The recording contains the stage only: no source, file names, paths, prompts, command text or the receiver's token.

**Record & Broadcast** also renders up to ten minutes of the recorded performance to WAV, offline and deterministic, and
exports the derived performance data as JSON.

## 7. Stream with OBS

**Record & Broadcast › OBS** builds the overlay URL (`?overlay=1&sound=1&project=<id>`) with its options and the Browser
Source settings: 1920×1080 and **Control audio via OBS** ticked. Acceptance procedure and what has been verified:
[OBS.md](OBS.md).

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| The page does not load | receiver not running, or another port | `npm run doctor`; start it with `npm start` |
| No project appears | capture not started, or the extension cannot reach the receiver | CR status-bar item → Start; `npm run doctor` shows the port the receiver uses; the extension's port setting is `resonance.receiverPort` |
| Events arrive late | by design: interpretation runs ~10 s behind the work | wait; the replay has everything |
| No sound | the browser needs a click; or the tab is muted | **Enable sound**; check the tab's audio |
| Recording says *no sound* | sound was off or the audio output could not be captured | enable sound first, then record |
| Record says recording is unavailable | the browser lacks MediaRecorder or canvas capture | use Chrome or Edge |
| *Recording finished early (the sound stopped …)* | the audio device was disconnected or stopped working | reconnect it, check that you hear the music, record again |
| *… stopped: the pack stopped answering* | a visual pack hung or was too slow for this machine | lower **Quality**, then **Retry**; or choose another look |
| *… exceeds its declared budget* | the pack draws more than its author declared | it keeps running; lower Quality if frames are slow |
| *… contains code and is not approved* | a shader or world pack waits for your approval | **Review** in Visual Packs, or `node scripts/pack.js approve <id>` |
| *… files changed after approval* | an installed pack's files were modified | import it again in Visual Packs (or `node scripts/pack.js install <folder>`) and approve again |
| Black or frozen world | no WebGL2 (the player falls back), or a GPU driver problem | try another browser; set Quality to Low |
| Windows cannot open the application of a receiver in WSL | localhost forwarding off | [WSL.md](WSL.md) |
| *View only · Pair this browser* / changes are refused | this browser is not paired | open the link `npm run pair` prints (once per browser) |
| In OBS the Construct shows instead of the living world | OBS's browser has no WebGL (typically no usable GPU with hardware acceleration on) | OBS → Settings → Advanced → turn off *Browser Source Hardware Acceleration*, restart OBS |

Your data stays in `~/.code-resonance`; nothing leaves the machine. Never share that folder or its token.

# Getting started

From nothing to a project you can watch, hear, record and stream, then make it your own. About a minute to a visible
world; choosing a look, recording and streaming follow when you want them.

## About 60 seconds

Node.js 20 or later, in the Code Resonance folder (it has no dependencies to install). For the Control Center: a
Chromium-based browser (Chrome or Edge: recording needs one, and other browsers have not been tested) with WebGL2 for
the living worlds. For capture: VS Code 1.99 or later.

Two places are involved. The **receiver** runs in a terminal in the Code Resonance folder and keeps running while you
work. The **VS Code window of the project you want to watch** is where the extension captures your work and sends it to
the receiver. The receiver must run where that window's extension host runs: for a project opened in VS Code through
WSL, run the receiver inside WSL ([WSL.md](WSL.md)).

In the Code Resonance folder:

```bash
npm run up
```

That one command, on loopback only:

1. Checks Node.js 20+.
2. Starts the receiver on `http://127.0.0.1:4174` (data in `~/.code-resonance`), or **reuses** a Code Resonance receiver
   already there. If any other program holds the port, it **refuses**: it does not write a token, mint a pairing link, or
   open a browser. Free the port and run it again. `RESONANCE_DATA` / `--data` and `RESONANCE_PORT` / `--port` change the
   directory and port.
3. Builds `code-resonance-0.7.2.vsix` (Node only) and, when the `code` command works, installs it unless you pass
   `--no-install`. If the install does not succeed, it says so; install the file from VS Code (step 1 below).
4. Prints a **pairing link** (`http://127.0.0.1:4174/#pair=…`, single use, 15 minutes) and tries to open it unless you
   pass `--no-open`. Inside WSL it also prints a `localhost` link *From Windows (WSL)*: open that one in your Windows
   browser. When this command starts the receiver, the receiver prints a link of its own as well; either works, once.
5. If you have no real project yet, posts a fictional session labelled *Demonstration (fictional)* unless you pass
   `--no-demo`. It does not add a demonstration on top of a real project.

Leave that terminal open: `Ctrl+C` stops a receiver this command started. A receiver it reused is left running.

Then, in the VS Code window of the project you want to watch:

1. **The extension.** *Extensions* should list **Code Resonance** (under *WSL* for a WSL window). If it is missing,
   use *Extensions › … › Install from VSIX* and pick `code-resonance-0.7.2.vsix` from the Code Resonance folder. If the
   status bar shows no **CR** item, run **Developer: Reload Window**.
2. **Capture.** The item reads **CR stopped** until you start: click it, choose **Start Code Performance** (also in the
   Command Palette as **CODE RESONANCE: Start Code Performance**) and accept local capture. The workspace must be
   trusted.
3. **Check.** Within seconds the Control Center shows the project by its folder name, with its files under Structure.
   Home says *VS Code capture running*.
4. **Watch and listen.** Click **Enable sound** (browsers need a click before audio), then **Open Stage**. What you see
   and hear runs about 10 seconds behind your work, by design.

Capture resumes by itself when VS Code restarts, until you stop it from the **CR** menu. On later days, `npm run up`
(or `npm start`) in the Code Resonance folder is all you need.

```bash
node scripts/up.js [--data <dir>] [--port <port>] [--no-demo] [--no-install] [--no-open]
```

Check the setup at any time (read-only: Node, the receiver, its token, projects, visual packs waiting for approval, and
inside WSL2 how to reach the player from Windows):

```bash
npm run doctor
```

`npm run pair` prints a new pairing link whenever you need one. A browser opened on `http://127.0.0.1:4174/` without
the link can watch, play and record, and says **View only · Pair this browser**.

Optional: let agents join as a CAST (name, seat, voice) in the project's world. In a **trusted workspace**:

```bash
npm run hooks:claude -- /path/to/project
npm run hooks:cursor -- /path/to/project
npm run hooks:codex -- /path/to/project
```

Then start a new agent session in that project: a session that was already running does not pick up new hooks. Codex
also asks you to review and trust new hooks (`/hooks`) before they run. While an agent is only thinking, nothing new
arrives: Code Resonance sees its sessions, tools and files, never its reasoning.

**Several agents on one project.** The hooks belong to the project, not to one session: once a tool's hooks are in,
every session of that tool in the project joins, at the same time if you like. A typical day (Claude Code in two
terminals on different parts of the code, a Cursor agent chat on a third, Codex on tests) shows four presences, each
going to the files it works on, each edit attributed to the session whose tool touched the file. Sessions of the same
tool running together are numbered in labels and the hover card (*Claude*, *Claude 2*; a lone session is just
*Claude*; a closed session's number is free again), and share the tool's colour and voice. Subagents show as their
tool's *subagent*. Two different tools on the same file (or the same subsystem) within a minute are a *meeting* of
agents; two sessions of the same tool are not. An agent with no hooks here (for example one built into an editor
without an adapter) is not a presence: its edits still arrive, unattributed, like your own.

Connections shows what the receiver has actually observed (VS Code capture, the settings the extension reported, Claude
Code, Cursor and Codex activity) and can add or remove each adapter after showing the exact change. Cursor is
observe-only after-hooks (never `subagentStart`). Codex is observe-only (never `PreToolUse` / `PermissionRequest`;
paths only from patch headers). Stage chips show catalog names (Claude, Cursor, Codex, Grok, Qwen, Kimi), not vendor
art. Overnight CAST and a public OBS night: [campaign-0.7.md](campaign-0.7.md). The README hero is a 70-second CAST
session of Pulse.

## Manual fallback

If you prefer to run each step yourself (about ten minutes), or `code` was not on PATH:

```bash
npm start
```

It listens on `http://127.0.0.1:4174` (loopback only) and prints a pairing link. Open that link in the browser you use
for Code Resonance. In a second terminal:

```bash
npm run package:vsix
code --install-extension code-resonance-0.7.2.vsix
```

Open a trusted workspace, click **CR** and accept local capture. With no project yet, `npm run demo` in a second
terminal posts a labelled fictional session. The project appears in the project switcher at the top of the Control
Center within seconds; the performance runs about 10 s behind your work (interpretation needs a little hindsight).
Capture resumes when VS Code restarts until you stop it from the same menu.

## Choose how it looks and sounds

**Visual Studio** shows the project's identity (its Visual Recipe) and the worlds it can take: choose a world, see it
on the stage as a preview (*Preview · not saved*), customise its parameters (spectacle, motion, information on the
stage, the public title, subsystem names, and every genome parameter of the family or pack), then **Apply** — or
**Cancel**, and nothing changed. **Propose public names** fills subsystem aliases from each role plus a generated name
(`Craft - Vauos`; a hyphen, because aliases reject a middle-dot) and writes nothing until **Accept**. Customising locks
the identity; *Reset customisations* returns to the generated values. Visual presets save a look you want to reuse on other projects. The same page chooses the **finish** (Clean,
Cinematic, Dreamlike; Classic is the look from before finishes) and, under *Digital life*, the inhabitants and how much
the music moves them (**Music influence** 0, 1 or 2). A project made before these existed says *Made before Phase 11*
and keeps its look until you choose *Use the Phase 11 finish* (and ecology, where it has digital life).

**Music Studio** sets the style (Ambient, Pulse, Cinematic, Chip), tempo (the project's own or manual), texture and
volume, for this project or as the global default; changes are heard on the next bar and saved only when you apply.
New projects play the **composed score**; one made earlier keeps the classic score until you choose *Use the composed
score* (it can be undone). The composed score's **character** (mood, evolution, melody, rhythm, atmosphere, harmony,
dynamics, space) and its **balance** (a level and a mute for each voice) shape how it is played; the project's key,
mode and motif never change. Details: [MUSIC.md](MUSIC.md).

**Quality** (Settings › This device, or on the Stage) sets the rendering level of this machine: *Auto* adapts (it lowers
quality when frames are slow and climbs back); *High*, *Medium · no MSAA*, *Low · 75 %* and *Lowest · 55 %* fix it.

**Visual Packs** installs packs from a `.zip` or a folder (nothing is downloaded from the internet). Packs with code
(shader and world packs) are installed unapproved and run only after you review their exact files and digest and
**Allow this code**. If one misbehaves (an error, no answer for 6 s, too slow, a lost GPU context) it is stopped, the
reason is shown, and the identity continues without it; **Retry** runs it again. Nothing restarts on its own.

## Create a composition

The **Artist Studio** (Home › *Create a composition*, or `#/artist`) builds an original look from procedural layers
(fractals, particle populations, ribbons and flow, structures, atmospheres, lights) over one of the flagship worlds or a
blank canvas, and decides what each layer reacts to: the music, the project's real engineering events, the digital
life. Start
from one of the starters, from a world, or from the blank composition.

- The stage previews the working copy in this window only (*Preview · this window only*); other windows, the OBS view
  and recordings keep showing the saved look, and Record waits until you apply or cancel.
- **Save** keeps it in My creations, with its last five versions; **Versions** brings one back.
- **Apply to project** makes it the project's look everywhere: the Stage, the OBS view, recordings and replays.
- **Export** writes a data-only pack (no code, nothing about your project) that another installation imports in
  Visual Packs, without any approval.

Everything about layers, mappings and limits: [ARTIST-STUDIO.md](ARTIST-STUDIO.md).

## The Performance Stage

**Stage** (top bar, rail, or **F** anywhere) shows the world alone. Controls appear when you move the pointer and fade
after a moment: live or replay, play and scrub, speed, information (Cinematic, Explorer — click the world to inspect it
—, Stream, Off), world, quality, sound, record, full screen (**F**), and a button to open the Stage in a new window for
a second monitor. The Stage shows the project's public title only, never its folder name.

## Record

**Record** (top bar, Stage, or **Record & Broadcast**) records what the stage shows (the world and its labels, for every
world and every kind of pack) together with the music, to a WebM file, until you stop it. Profiles: **720p** (the
default), **1080p** (sharper; the built-in worlds may not hold 30 fps on an integrated GPU) or the stage's size. Only
one window records at a time. The file downloads when you stop, or when a pack is stopped while recording.
Chromium-based browsers (Chrome, Edge) and OBS support it; elsewhere the application says recording is unavailable. The
browser keeps the recording in memory until you stop (about 60 MB a minute at 720p and 90 MB at 1080p); for sessions
longer than about half an hour, record with OBS. While a Visual Studio or Artist Studio preview is shown, Record asks
you to apply or cancel it first: a recording shows what is saved. If the sound stops reaching the recording (an audio device disconnected or stalled), the
recording is finished and saved at that moment, with the reason. Code Resonance keeps no copy or library of recordings.

The recording contains the stage only: no source, file names, paths, prompts, command text or the receiver's token.

**Record & Broadcast** also renders up to ten minutes of the recorded performance to WAV, offline and deterministic, and
exports the derived performance data as JSON.

## Last night

Home shows **Last night** under the live world once a real (not demo) project has a recorded performance long enough to
score: a sped-up replay of one highlight (failure and recovery, a meeting of agents, a structure). Default **4×**;
**16×** when the scored window is long. Play it there; the player does not need Playwright.

The highlight is chosen from the **last 24 hours of the project's own recording** (measured back from its last
recorded window, not from the clock): a project you last worked on a week ago shows that last day. Only if nothing in
those 24 hours scores is the whole history considered. A recording of a day or less is scored as a whole. Home asks the
receiver at most once every 30 seconds per project, and again only after that project's recorded performance has grown,
so a night appears or changes within about half a minute of the performance that earns it.

**Record** is live: what the stage shows now, as it plays. A **film** is the publish object: the same highlight, frame by
frame, for a README hero. It needs a public title (Visual Studio). Play still works without one. From the repository:

```bash
npm run film -- --project <id>
```

That always `--copy`s the data directory, picks the same window Home plays, defaults to cinematic labels, and writes
`qualification/results/films/last-night.webm`. It uses the GPU when one is present; if the browser cannot use the GPU
it found, it says so and renders in software (slower). Pin an adapter with `--gpu nvidia` or `--gpu amd` (then a
missing GPU is an error); `--gpu off` is software. Ctrl-C stops it and removes its temporary copy. First time:
`cd qualification && npm ci`. Films never show folder names, paths or prompts. The overnight CAST checklist:
[campaign-0.7.md](campaign-0.7.md).

## Stream with OBS

**Record & Broadcast › OBS** builds the overlay URL (`?overlay=1&sound=1&project=<id>`) with its options and the Browser
Source settings: 1920×1080 and **Control audio via OBS** ticked. Acceptance procedure and what has been verified:
[OBS.md](OBS.md).

## Make it yours

**How do I choose or customise a world?** In the Visual Studio: choose a world, preview it, change its parameters, its
finish and its digital life, then Apply. *Reset customisations* returns to the generated identity.

**How do I tune the music?** In the Music Studio: style, tempo, the composed score's character and balance, for this
project or as the default for every project, heard from the next bar. [MUSIC.md](MUSIC.md) explains each control.

**How do I create an original composition?** In the Artist Studio: layers over a world or the blank
canvas, and what each one reacts to.

**How do I save or restore versions?** **Save** in the Artist Studio keeps the last five versions of a composition;
**Versions** brings one back. Visual and music presets keep a look or a sound to reuse on other projects.

**How do I share a creation?** **Export** in the Artist Studio (or in Visual Packs, under My creations) gives a `.zip`;
the other person imports it in Visual Packs and chooses **Use**.

**What is a data-only pack?** A pack with no code: a tuned look of a built-in world, or an Artist Studio creation. It
is validated and installs without approval, and cannot run anything.

**When does executable approval apply?** Only to shader and world packs, which contain code: they install unapproved
and run, isolated, only after you review their exact files in Visual Packs and allow them. Any change to their files
needs a new approval.

**How do I use my creation in OBS?** Apply it to the project, then add that project's overlay URL from Record &
Broadcast › OBS as a Browser Source: the OBS view shows what is applied, never a preview.

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| The page does not load | receiver not running, or another port | `npm run doctor`; start it with `npm run up` or `npm start` |
| `npm run up` refuses the port | another program (not Code Resonance) is on 4174 | free `RESONANCE_PORT` (default 4174) and run it again |
| `npm run up` refuses leftover on the port | a Code Resonance receiver answers, but `--data` has no `receiver-auth.json` (another data directory, or a leftover process) | pass the matching `--data` / `RESONANCE_DATA`, or free the port |
| `npm run up` says *code --install-extension did not succeed*, after *Unable to connect to VS Code server … ENOENT … vscode-ipc-….sock* | the terminal was restored from an earlier VS Code session and points at a VS Code connection that no longer exists | open a new terminal (**+** in the terminal panel) and run it again, or in VS Code use *Extensions › … › Install from VSIX* with `code-resonance-0.7.2.vsix` from the Code Resonance folder |
| `npm run up` says *VS Code CLI (code) is not on PATH* | it ran outside VS Code's terminal, or VS Code's `code` command is not installed | *Extensions › … › Install from VSIX* in VS Code, or run it from VS Code's integrated terminal |
| No **CR** item in the status bar | the window was already open when the extension was installed, or the extension is installed on the other side (Windows instead of WSL) | **Developer: Reload Window**; *Extensions* should list Code Resonance under *WSL* for a WSL window |
| No project appears | capture not started, or the extension cannot reach the receiver | CR status-bar item → Start; `npm run doctor` shows the port the receiver uses; the extension's port setting is `resonance.receiverPort` |
| The project shows as *Project 1a2b3c4d*, says *No VS Code capture* and has no structure | only an agent's hooks have reported so far; VS Code capture is not running in that folder | in that project's VS Code window: **CR stopped** → **Start Code Performance**; the name and files follow within seconds |
| An agent never appears after `npm run hooks:…` | the agent session started before the hooks were added; Codex has not trusted the new hooks yet; or the workspace is not trusted | start a new agent session in that project; in Codex, review the hooks with `/hooks`; nothing arrives while an agent is only thinking |
| The world looks grainy or soft | **Auto** quality lowered the resolution because frames were slow on this GPU; the Cinematic finish adds a fine film grain | Visual Studio (or Settings) → rendering quality on this device → **High**; Visual Studio → Finish → **Clean** for less grain; on Windows, let the browser use the high-performance GPU (Settings → System → Display → Graphics); **Open Stage** shows the full resolution |
| Events arrive late | by design: interpretation runs ~10 s behind the work | wait; the replay has everything |
| No sound | the browser needs a click; or the tab is muted | **Enable sound**; check the tab's audio |
| Recording says *no sound* | sound was off or the audio output could not be captured | enable sound first, then record |
| Record says recording is unavailable | the browser lacks MediaRecorder or canvas capture | use Chrome or Edge |
| *Apply or cancel the … first* when recording | a Visual Studio or Artist Studio preview is shown in this window | apply it or cancel it, then record |
| *Recording finished early (the sound stopped …)* | the audio device was disconnected or stopped working | reconnect it, check that you hear the music, record again |
| Last night is missing | the recording is short, a demo, or nothing scored | keep capturing; it appears once a real project has a highlight |
| `npm run film` refuses | no public title | set one in Visual Studio, or pass `--allow-untitled` |
| `npm run film` prints `cd qualification && npm ci` | Playwright stays in qualification/, not the product | run that command once, then `npx playwright-core install chromium` in `qualification/` (Playwright downloads no browser by itself) |
| Cursor or Codex hooks silent | workspace not trusted, or a permission hook expected | prove only in a trusted workspace; Cursor never uses `subagentStart`; Codex never uses `PreToolUse` / `PermissionRequest` |
| *… stopped: the pack stopped answering* | a visual pack hung or was too slow for this machine | lower **Quality**, then **Retry**; or choose another look |
| *… exceeds its declared budget* | the pack draws more than its author declared | it keeps running; lower Quality if frames are slow |
| *… contains code and is not approved* | a shader or world pack waits for your approval | **Review** in Visual Packs, or `node scripts/pack.js approve <id>` |
| *… files changed after approval* | an installed pack's files were modified | import it again in Visual Packs (or `node scripts/pack.js install <folder>`) and approve again |
| Black or frozen world | no WebGL2 (the player falls back), or a GPU driver problem | try another browser; set Quality to Low |
| Windows cannot open the application of a receiver in WSL | localhost forwarding off | [WSL.md](WSL.md) |
| *View only · Pair this browser* / changes are refused | this browser is not paired | open the link `npm run pair` (or `npm run up`) prints (once per browser) |
| In OBS the Construct shows instead of the living world | OBS's browser has no WebGL (typically no usable GPU with hardware acceleration on) | OBS → Settings → Advanced → turn off *Browser Source Hardware Acceleration*, restart OBS |

Your data stays in `~/.code-resonance`; nothing leaves the machine. Never share that folder or its token. Where
everything is kept, backups, updates and diagnostics: [OPERATIONS.md](OPERATIONS.md).

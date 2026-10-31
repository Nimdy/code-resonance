# Code Resonance

**Your development work, performed live.** Code Resonance turns what really happens in your workspace (edits, files,
tests, builds, commits, and your AI agents if you connect them) into a generative world that grows with your code and a
score that follows it, interpreted and played on your own machine.

![Two agents meet in orbit in Stellar Forge while Cursor edits](https://raw.githubusercontent.com/Nimdy/code-resonance/main/docs/media/cast-collision.jpg)

| | |
|---|---|
| ![Fractal Biosphere: each subsystem grows as an organism](https://raw.githubusercontent.com/Nimdy/code-resonance/main/docs/media/world-biosphere.jpg) | ![Machine Cathedral: verified milestones gild the spire](https://raw.githubusercontent.com/Nimdy/code-resonance/main/docs/media/world-machine-cathedral.jpg) |
| **Fractal Biosphere.** Subsystems grow as organisms; milestone blooms stay. | **Machine Cathedral.** Precincts on black water; verified milestones gild the spire. |

## Getting started

1. **Start capture.** In a trusted folder, click **CR stopped** in the status bar, choose **Start capture** and accept
   local capture. If no receiver is running, the extension starts the one it carries, on `127.0.0.1:4174`, with VS
   Code's own runtime: nothing else to install.
2. **Open the Control Center.** **CR › Open Stage** opens it in your browser, already paired with your receiver.
3. **Listen.** Click **Enable sound**, then **Open Stage**. The performance runs about ten seconds behind your work, by
   design: interpretation needs a little hindsight.

Capture resumes by itself when VS Code restarts, until you stop it from **CR**.

## Privacy

Capture starts only after you accept it, only in a trusted workspace, and everything stays on your computer: the
extension sends to a receiver on loopback (`127.0.0.1`) that answers only local requests and proves it holds your token
before anything is sent to it. Typed text is never captured, only per-second counts; source snapshots are kept on disk
for analysis and never shown; command lines and prompt text are stored only if you opt in. The Stage, the OBS view and
recordings show no source, file names, paths, prompts or commands. No account, telemetry, cloud service or model API.
The full model: [SECURITY.md](https://github.com/Nimdy/code-resonance/blob/main/SECURITY.md).

## The receiver

The receiver records what the extension reports, interprets it and serves the player and Control Center. When you
start capture or open the Stage and none answers on `resonance.receiverPort`, the extension starts the one it carries as
a separate process: bound to `127.0.0.1` only, shared by every VS Code window, and still running after VS Code closes.
A receiver that is already running (for example `npm start` in a Code Resonance checkout, or one another window
started) is used instead and never replaced. **CR › Receiver status** shows which one runs and who started it, opens
the Control Center with a pairing link, and stops the one the extension started. Its data lives in
`~/.code-resonance` (`%USERPROFILE%\.code-resonance` on Windows); its log in `logs/receiver.log` there; the Output panel
(**Code Resonance**) records each decision.

**WSL, SSH and containers:** the extension runs where your workspace is, so the receiver starts there too (inside WSL
for a WSL window). A Windows browser reaches a receiver in WSL2 at `http://localhost:4174/`.

## AI agents (optional)

**CR › Connect an AI agent…** adds observe-only hooks for **Claude Code**, **Cursor** or **Codex** to this workspace
(`.claude/settings.local.json`, `.cursor/hooks.json`, `.codex/hooks.json`) after showing the exact change in a diff.
The agent then joins the world as a presence of its own: its sessions, tools and the files it touches, never its
reasoning, and its prompts only as a length and fingerprint. The hooks run `node` with an adapter kept in
`~/.code-resonance/hooks`, a path that stays the same across updates; the agent needs Node.js on its PATH. Start a new
agent session afterwards.

## Commands

| Command | What it does |
|---|---|
| CODE RESONANCE: Start / Stop Code Performance | Start capture (after consent) or stop it |
| CODE RESONANCE: Open Code Stage | The Control Center in your browser, paired, on this project |
| CODE RESONANCE: Open OBS View | The clean browser-source view with sound |
| CODE RESONANCE: Open Control Center (Pairing Link) | The Control Center, paired, without choosing a project |
| CODE RESONANCE: Receiver Status / Stop Receiver / Show Receiver Log | Which receiver runs; stop the one the extension started; its log |
| CODE RESONANCE: Connect an AI Agent (Hooks) | Add or remove observe-only hooks for Claude Code, Cursor or Codex |
| CODE RESONANCE: Record AI Prompt (Explicit) | Record a prompt you typed elsewhere (length and fingerprint unless you opt in) |

## Settings

`resonance.receiverPort` (4174) and `resonance.startReceiver` (on) decide where the receiver is and whether the
extension starts one. `resonance.captureDocumentContents`, `captureTerminalCommands`, `capturePromptText`,
`includeHidden`, `shareProjectName` and `baselineFileLimit` decide what capture sends. When capture starts, and when one
of these settings changes while it runs, the extension reports its version, the remote kind (for example `wsl`) and
these values, never paths or names, so the Control Center shows what capture actually does.
`vscode://zerobandwidth.code-resonance/settings`, linked from the Control Center, opens these settings and nothing else.

## Requirements

VS Code 1.99 or later. A Chromium-based browser (Chrome or Edge) with WebGL2 for the Control Center and the living
worlds; other browsers have not been tested. Node.js only for agent hooks.

**Preview.** Qualified in a real VS Code 1.143 on Linux (WSL2); capture also on GitHub's Windows runners. The receiver
the extension starts has not yet been run on Windows or macOS. [Documentation](https://github.com/Nimdy/code-resonance#readme) ·
[Getting started](https://github.com/Nimdy/code-resonance/blob/main/docs/FIRST-RUN.md) ·
[Operations](https://github.com/Nimdy/code-resonance/blob/main/docs/OPERATIONS.md) ·
[Issues](https://github.com/Nimdy/code-resonance/issues)

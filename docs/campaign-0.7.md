# 0.7.0 campaign

Operator runbook: one overnight CAST session, a morning reel, a README hero from that night, and a later public OBS
night. The README hero is a 70-second CAST session of Pulse ([docs/media](media/README.md)). Overnight CAST and a
public OBS night remain.

Product **0.7.0**, tagged `v0.7.0` on `main`. Interpretation **8** (CAST seats and `agent.collision`) is independent of
the product version: [ARCHITECTURE.md](../ARCHITECTURE.md#versions-and-compatibility).

Agents are a CAST (name, seat, voice) in the project's world. Stage chips show catalog names: Claude, Cursor, Codex,
Grok, Qwen, Kimi. No vendor art styles.

## Privacy floor

The Stage, the OBS view, recordings and films never show source, file names, paths, prompts, command text or the
project's folder name. Labels are public labels (a CAST name, an event's meaning, a public title you set, a subsystem
alias you accept). Check every frame you publish against that floor: [SECURITY.md](../SECURITY.md).

## 1. The public floor

- Treat **0.6.0** as the previous tagged floor: `v0.6.0` on `main`.
- This tree is **0.7.0**, tagged `v0.7.0` (`package.json`, `extension/package.json`, VSIX `code-resonance-0.7.0.vsix`).
- First run on this machine: [FIRST-RUN.md](FIRST-RUN.md).

```bash
npm run up
```

About a minute to a visible world. Trusted workspace, **CR**, accept local capture, **Enable sound**.

## 2. Install the CAST adapters

Do this in a **trusted workspace** of a real project (not the fictional demonstration). Connections (`#/connections`)
shows the exact change and writes nothing until you accept it.

| Adapter | Command | File | Constraint |
|---|---|---|---|
| Claude Code | `npm run hooks:claude -- /path/to/project` | `<project>/.claude/settings.local.json` (personal, not committed) | Adapter never prints and always exits 0 |
| Cursor | `npm run hooks:cursor -- /path/to/project` | `<project>/.cursor/hooks.json` | Observe-only after-hooks. **Never** `subagentStart` (a permission hook: empty stdout denies Task spawn). Prove only in a trusted workspace |
| Codex | `npm run hooks:codex -- /path/to/project` | `<project>/.codex/hooks.json` | Observe-only. **Never** `PreToolUse` or `PermissionRequest` (they can deny). Paths only from patch headers. Prove only when the project `.codex/` layer is trusted |

Cursor and Codex may commit those hook files; the adapter command is an absolute path on this machine — gitignore the
file or do not commit that entry.

Grok, Qwen and Kimi have catalog seats and chips; they report through `node scripts/event.js` (or their file writes are
seen and stay `unknown` until a hook names them). Other providers hash into seats 6–7.

Connections can add or remove Claude, Cursor and Codex hooks after the same review (`POST /api/integrations/{claude,cursor,codex}/{plan,apply}`).

## 3. One overnight CAST session

Not done. When you run it:

1. Receiver up (`npm run up` or a receiver it reused). Browser paired. Capture started in the trusted workspace.
2. The three adapters installed and a fresh Claude, Cursor and Codex session started in that folder, so hooks fire.
3. Leave capture running. Interpretation lags about 10.5 s; the journal is the source of truth for the morning.
4. Do **not** use **Record** all night: the browser holds the WebM in memory (about 60 MB a minute at 720p). For a live
   picture of the stage overnight, use OBS ([OBS.md](OBS.md)); that is optional and is not the morning film.
5. Stage / OBS labels stay on **cinematic** or **stream**. Confirm no folder name, path or prompt is drawn.

A meeting of two catalogued providers on the same file or district inside 60 s is `agent.collision` (an intent and a
derived cue that adds no progress, since interpretation 9). Last-writer still attributes the edit. Worlds express the
collision; they never invent one.

## 4. Morning: Last night and a film

Home shows **Last night** once a real (not demo) project has a recorded performance long enough to score: a sped-up
replay of one highlight (failure and recovery, a meeting of agents, a structure). Default **4×**; **16×** when the
scored window is long. Playwright is not involved. Play still works without a public title.

To **publish** that window:

1. Visual Studio: set a **public title** (this is what the title card and the film show). Optionally **Propose public
   names**, then **Accept** — nothing is saved until Accept. Aliases use a hyphen (`Craft - Vauos`); a middle-dot is
   rejected.
2. First time: `cd qualification && npm ci`.
3. From the repository:

```bash
npm run film -- --project <id>
```

That always `--copy`s the data directory (so `~/.code-resonance` is not changed), picks the same window Home plays,
defaults to cinematic labels, and writes `qualification/results/films/last-night.webm` (never commit it). Uses the GPU
when one is present (`--gpu nvidia` / `--gpu amd` pins an adapter). `--allow-untitled` exists for private checks; a
README hero needs a title.

**Record** is live (what the stage shows now). **Last night** is a replay of a scored highlight. A **film** is the
publish object: the same highlight, frame by frame. [FIRST-RUN.md](FIRST-RUN.md#last-night),
[OPERATIONS.md](OPERATIONS.md#recordings-exports-and-films).

## 5. A README hero from that night

Done as a 70-second CAST session of Pulse, public title set, GPU film, cinematic labels. The README hero is
`docs/media/preview-cast.webp` → `docs/media/code-resonance-cast.mp4`, with collision / Claude / Recovery stills.
Privacy floor checked on stills and the title card: catalog names, no path, prompt or folder. Claude was a live CLI
session; Cursor and Codex arrived through their observe-only adapters in the same wall-clock window.

This is the publish object for 0.7.0. It is a 70-second session. A later overnight night can replace it the same way:

1. Cut 60–90 s from `qualification/results/films/last-night.webm` (or re-render a tighter `--from`/`--to`).
2. Watch it once for the privacy floor: no source, paths, prompts, folder names.
3. Put it on the README in place of this hero. Keep catalog names; no vendor art.

The Phase 11 worlds-tour reel stays in [docs/media](media/README.md) as `code-resonance-demo.mp4`.

## 6. A public OBS night later

Not scheduled. When you schedule one:

1. Record & Broadcast › OBS: overlay URL for the project, 1920×1080, **Control audio via OBS**.
2. Labels **stream**. Public title set. Confirm the overlay shows no folder name, path or prompt (OBS.md step 7).
3. Run the [OBS acceptance procedure](OBS.md#acceptance-procedure-reproducible) on the machine and OBS version you will
   stream with. OBS Studio 32.2 was qualified on Linux in a disposable CI machine; Windows and macOS OBS have not been
   run.
4. Announce it as a future night, not as something that has happened.

Getting started, data, backup and what is unverified: [FIRST-RUN.md](FIRST-RUN.md), [OPERATIONS.md](OPERATIONS.md).
The Control Center and the Stage: [CONTROL-CENTER.md](CONTROL-CENTER.md). Worlds and CAST chips: [WORLDS.md](WORLDS.md).

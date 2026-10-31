# Security and privacy model

**Capture is opt-in; privacy and data minimisation matter more than real-time effects.**

## What is collected, and where it stays

| Data | Collected | Stored | Ever on the Stage / OBS / films / exports |
|---|---|---|---|
| Source snapshots (≤150 KB, after Start, unless `resonance.captureDocumentContents` is off) | yes | gzip blobs on the receiver machine | **never** |
| Typed text | **no** — only per-second counts of edits, characters and lines | — | never |
| Terminal / task command text | only with `resonance.captureTerminalCommands` | journal | never |
| Command category (test, build, lint, …) and exit code | yes, classified inside the extension | journal | as cues |
| AI prompts and assistant messages (hooks) | length + fingerprint; text only with `RESONANCE_CAPTURE_PROMPT_TEXT=1` | journal | never |
| File paths | project-relative, secret patterns excluded | journal | **never** (salted hashed ids only) |
| Project folder name | with `resonance.shareProjectName` (default on) | receiver state | the Control Center only (labelled as private); never drawn on the Stage, OBS view, films or file names (their titles are generic unless you set a **public title** in Visual Studio) |
| Artist Studio compositions (the names, descriptions, layers and mappings you make) | made by you | `compositions.json` in the receiver's data, with the last five versions of each; the one a project uses is copied into its recipe | drawn as the applied look; an **export** holds the composition, a generated README, the author name and licence you type and a pack id `creator.<name>-<6 hex>`, never a project's name, paths, ids, recipe or anything about the computer |

Receivers older than v0.3 stored typed text. Since v0.3 the receiver drops inserted text even if an old extension sends it; existing journals from v0.2 may still contain it — delete them (below) if that matters.

## Boundaries

- The receiver binds to loopback by default and refuses other interfaces unless `RESONANCE_ALLOW_REMOTE=1`. Requests need a localhost `Host` header; cross-origin requests are refused (DNS-rebinding protection).
- Ingestion (`/v1/*` except `GET /v1/challenge`) requires the bearer token in `~/.code-resonance/receiver-auth.json` (mode 0600), compared in constant time. `GET /v1/challenge?nonce=<32 hex>&v=2` returns HMAC-SHA256 of that token over `cr-challenge-v2|<port>|<nonce>`, for the port the request arrived on, never the token itself (without `v=2`, the 0.7.1 form, HMAC-SHA256 over the nonce alone, for extensions installed before; no current client accepts it).
- **Every program that sends the token proves the receiver first.** The extension's outbox and its *Open Code Stage* pairing, `npm run up`, `npm run pair`, every agent hook adapter, `scripts/event.js` and `npm run demo` ask the challenge before they send `Authorization`, and send it only if the answer is the HMAC for the port they connected to (one client implementation, `extension/proof.js`; the receiver re-exports it). They never follow a redirect, so a process on one port cannot pass by sending the client to, or relaying the answer of, a real receiver on another port. The outbox verifies once per receiver connection and again after any failed delivery or a changed port; the hooks and the CLIs verify once per run. A process that only mimics `/health` (even with a planted `receiver-auth.json`) never receives `Authorization`: the hooks spool silently and exit 0, the outbox keeps its batches queued (*CR queued (receiver not verified)*), the CLIs exit with an error, as when the receiver is down. The outbox also re-verifies when the token in `receiver-auth.json` changes. **Limit:** a proof speaks for the occupant at the moment it answered. A process that takes the port in the moment between a receiver stopping and the outbox's next delivery (every 2 s), without a delivery failing in between, would receive that delivery; a failed delivery (the receiver stopped, the port closed) always forces a new proof.
- **Administrative changes** (settings, project preferences, presets, recipes, Artist Studio compositions, pack
  import/install/approval/removal, every agent's hooks) need a **control capability** (`X-Resonance-Capability`). `POST /api/session` issues one only to a
  request from the loopback socket (a LAN client of a receiver started with `RESONANCE_ALLOW_REMOTE=1` gets none,
  whatever headers it forges), with the page's own Origin and fetch metadata, that presents the receiver's **pairing
  key** (also in `receiver-auth.json`, so only your account can read it). A browser receives the key once, in the
  pairing link `npm start` / `npm run pair` prints (or VS Code's *Open Code Stage* opens). The link carries a
  single-use code, valid 15 minutes, which the receiver exchanges for the key once (minting a code needs the ingestion
  token, which goes only to a receiver that answered the challenge above). The key itself never appears in a link, a
  log or a command line. The browser keeps the key in that origin's
  storage and removes the code from the address bar at once. Without it a browser can watch, play and record but change
  nothing; another program or account on this computer cannot obtain a capability by forging an Origin header. A
  cross-origin page cannot send the custom header without a CORS preflight, which the receiver never answers.
  Capabilities live in the receiver's memory only (12 h, renewed on use). The OBS view never requests one. The ingestion
  token and the pairing key are never returned by any API route (the key is returned once, to the page that redeems a
  pairing code). **Limit:** the browser holds the key for the receiver's address (`127.0.0.1:<port>`); a program that
  listens on that port while the receiver is stopped could read it from the browser and use it later. On a computer
  shared with accounts you do not trust, keep the receiver running while you use the browser, or delete the key from
  the browser (site data) when you stop.
- **Pack import** (Visual Packs) accepts a `.zip` or a folder from your disk, never a URL. Archives are read by the
  receiver's own bounded reader (no symbolic links, encryption, ZIP64, traversal, absolute, device or duplicate names;
  declared sizes and CRCs are verified; the SDK's limits on file count, file size and total size apply before anything
  is written) into a quarantine directory, validated by the same code as `scripts/pack.js`, and installed only on an
  explicit Install. Code packs are always installed unapproved; an approval is bound to the exact files (digest), a
  pack whose files changed cannot be approved, and the reserved names `trust.json` and Windows device names are refused.
- **Claude Code hooks from the Control Center** write only `<project>/.claude/settings.local.json`, only the adapter's
  hook entries, after showing you the exact before/after, and only if the file did not change meanwhile; links
  (`.claude` or the file itself), network paths, folders inside the data directory and your home directory (or a link
  to it: its hook files are your user-level settings, which run in every workspace) are refused.
- **Cursor hooks from the Control Center** write only `<project>/.cursor/hooks.json`, only the adapter's observe-only
  after-hook entries, after the same review; links (`.cursor` or the file itself), network paths, folders inside
  the data directory and the home directory are refused. Prove them only in a **trusted workspace**. The adapter never persists edit hunks
  (`old_string` / `new_string`), command lines or command output.
- **Codex hooks from the Control Center** write only `<project>/.codex/hooks.json`, only the adapter's observe-only
  entries, after the same review; links (`.codex` or the file itself), network paths, folders inside the data
  directory and the home directory are refused. Prove them only in a **trusted workspace**. `PreToolUse` and `PermissionRequest` are not
  installed (they can deny). The adapter never persists patch hunks, command lines or tool output: paths only, from
  patch headers.
- **Gemini CLI, Qwen Code, GitHub Copilot, Factory Droid, Grok Build and goose hooks from the Control Center** write
  only the tool's project file (`.gemini/settings.json`, `.qwen/settings.json`, `.github/copilot/settings.local.json`,
  `.factory/hooks.json`, `.grok/hooks/code-resonance.json`, `.agents/plugins/code-resonance/hooks/hooks.json`), only
  the adapter's entries, after the same review; a link on **any** folder of that path (for example `.github` or
  `.agents/plugins`) or on the file itself, network paths, folders inside the data directory and the home directory are
  refused. `npm run hooks:<tool>` refuses the home directory too. No event that can deny, block or rewrite is
  installed (`BeforeTool`, `BeforeModel`, `BeforeToolSelection`, `PreToolUse`, `PermissionRequest`, `preToolUse`,
  `permissionRequest`). Each tool's trust rule applies (Gemini CLI and Qwen Code: trusted folders, and Gemini CLI asks
  before a new project hook runs; Copilot CLI: trusted folder; Grok Build: `/hooks-trust`; Droid and goose document
  none, so review the change before writing it).
- **Capture evidence** (Connections) is derived from the journal: session times, the extension's *reported* capture
  settings (values only, no paths), agent providers. VS Code settings are never changed by the receiver.
- Read endpoints return only derived data: hashed module, folder-group and symbol ids, symbol types, cue types, counts, controls and plot coordinates. Since interpretation v5 the ids are salted with a per-project secret kept in the receiver's data (`projects/<hash>/salt`, never published), so an exported or displayed id cannot be matched against a guessed path such as `src/index.ts`. Tests check that typed text, file paths and secrets planted in source never appear in any public endpoint or in the page.
- Paths with traversal, absolute paths, excluded directories (`node_modules`, `.git`, `dist`, …) and secret-like names (`.env*`, keys, credentials, `*.pem`, …) are rejected by both extension and receiver, which share one rule set. Dot-paths are excluded unless `resonance.includeHidden` is on. Filtering is not proof that content is clean: **do not capture repositories you have not reviewed.**
- HTTP responses send `no-store` and `nosniff`; the player uses a self-only CSP and no CDNs.
- The Claude Code adapter never writes to stdout and always exits 0, so it cannot alter Claude's decisions. It is installed per project in `.claude/settings.local.json`, which is not committed.
- The Cursor adapter is observe-only: after-hooks only, never writes to stdout and always exits 0, so it cannot deny, block or alter Cursor. It is installed per project in `.cursor/hooks.json`, the project hook file Cursor may commit. The adapter command is an absolute path on this machine — gitignore the file or do not commit that entry. The Control Center writes it mode 0600. Cursor runs project hooks only in a trusted workspace.
- The Codex adapter is observe-only: it never writes to stdout and always exits 0, so it cannot deny, block or alter Codex. It is installed per project in `.codex/hooks.json`, the project hook file Codex may commit. The adapter command is an absolute path on this machine — gitignore the file or do not commit that entry. The Control Center writes it mode 0600. Codex runs project hooks only when the project `.codex/` layer is trusted. Paths come from patch headers only.
- The Gemini CLI, Qwen Code, GitHub Copilot, Factory Droid, Grok Build and goose adapters (`scripts/hooks/*.js`, one shared runtime in `scripts/hooks/shared.js`) are observe-only in the same way: nothing on stdout, exit 0, the token only to a receiver that proves it holds it. They read only the fields each tool documents (cited in each adapter) and forward paths that pass the extension's filters, tool names, command categories and prompt/reply lengths and fingerprints; never prompts (unless `RESONANCE_CAPTURE_PROMPT_TEXT=1`), replies, command lines, tool arguments or output, edit strings or file contents. A payload that is not the documented shape becomes no event. Project files that may be committed (`.gemini/settings.json`, `.qwen/settings.json`, `.factory/hooks.json`) or belong to the adapter alone (`.grok/hooks/code-resonance.json`, `.agents/plugins/code-resonance/`) carry an absolute path on this machine: do not commit the adapter's entries. They were tested against documented payloads only, never a real session ([docs/AGENTS.md](docs/AGENTS.md)).
- Some agents also run other tools' hook files: Copilot CLI and VS Code's Copilot harness read the repository's `.claude/settings.json` and `.claude/settings.local.json`, Grok Build reads `.claude/settings.json` and `.cursor/hooks.json`. An adapter registered there runs for those agents too; this exposes nothing new (the adapter's privacy rules are the same), but a Copilot session can then be attributed to Claude.
- No analytics, telemetry, accounts, cloud APIs or remote model calls.
- **Visual packs.** Declarative packs are validated data. Packs with code (GLSL, JavaScript) are installed unapproved, run only after you approve their exact files (approval bound to a content digest), are served to the player as inert text, and execute only in a dedicated worker inside an isolated frame (`sandbox="allow-scripts"`, opaque origin, `connect-src 'none'`, no frames or popups; the worker has no DOM, cannot navigate and has no WebRTC) fed with a whitelisted, privacy-safe performance view. Frames are acknowledged and bounded; a pack that throws, stops answering, is far too slow, loses its GPU context, floods messages, navigates, is revoked or whose files change is stopped. Browsers cannot fully sandbox GPU shaders (hangs, driver crashes, timing side channels), and an approved pack can still waste CPU, memory or GPU time until it is stopped: approve only packs you trust. Details: [docs/packs/security.md](docs/packs/security.md).
- **Artist Studio compositions** are data, never evaluated: every save, import and recipe that carries one is validated
  against the composition model's allowlists (six layer types, the listed signals and targets, at most 8 layers within
  a rendering budget of 100) and normalised (values clamped, unknown keys dropped, names kept as text). An exported
  creation is a declarative pack: it can hold no code file, installs without approval, and is refused at import if it
  names an unknown layer type or signal or exceeds the budget. It is drawn by the built-in layer runtime, never in the
  pack frame, and gains no executable privilege.
- **This browser** keeps, in its storage for the receiver's origin: the pairing key, the active project's id, the last
  view, rendering quality, a few interface choices (such as the OBS URL options), the composition last opened in the
  Artist Studio, and the author name and licence you last used for an export. No project names, paths or tokens.
- **Recordings** (Record) contain only the stage the viewer sees (world and labels, in the chosen label mode) and the music output: no microphone, source, paths, prompts, commands or the receiver's token. They are saved by the browser as a download; nothing is uploaded. **Films** (`npm run film`) and **Home Last night** follow the same floor. Agent chips, collision callouts and the Last night cast use CAST catalog names (Claude, Cursor, Codex, Grok, Qwen, Kimi), never vendor marks; an agent that reports any other id is shown as "Agent" (the Control Center, which is private, names the id it reported), and visual packs receive catalog ids only.
- Not a boundary against other local users with access to your home directory or against malware running as you.

## Erasing data

Stop the extension and receiver, then delete `~/.code-resonance/projects/<hash>/` for one project, or `~/.code-resonance/` for everything (including the receiver token and pairing key; paired browsers then need the new link). Also clear the extension's outbox in VS Code's global storage (`.../globalStorage/zerobandwidth.code-resonance/outbox`) and any agent spool in `~/.code-resonance/spool/`. Artist Studio compositions belong to no project: deleting a project's folder leaves them in `~/.code-resonance/compositions.json` (delete them in the Artist Studio, or that file for all of them). A browser's own storage for the receiver's address is cleared with its site data. Nothing is copied anywhere else.

## Reporting a vulnerability

Report it privately through GitHub: on the repository's **Security** tab choose **Report a vulnerability** (private
vulnerability reporting), so the report and the discussion stay private until a fix is released. Please do not open a
public issue for it. Include the version (the release you installed: the VSIX has it in its name), the steps to reproduce
and what an attacker gains. Do not attach recordings, exports or receiver data that may contain secrets or source.

Fixes go into the latest release only. Code Resonance is maintained by one person: reports are answered as soon as
possible, without a guaranteed response time.

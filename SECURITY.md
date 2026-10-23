# Security and privacy model

**Capture is opt-in; privacy and data minimisation matter more than real-time effects.**

## What is collected, and where it stays

| Data | Collected | Stored | Ever on the Stage / OBS / exports |
|---|---|---|---|
| Source snapshots (≤150 KB, after Start, unless `resonance.captureDocumentContents` is off) | yes | gzip blobs on the receiver machine | **never** |
| Typed text | **no** — only per-second counts of edits, characters and lines | — | never |
| Terminal / task command text | only with `resonance.captureTerminalCommands` | journal | never |
| Command category (test, build, lint, …) and exit code | yes, classified inside the extension | journal | as cues |
| AI prompts and assistant messages (hooks) | length + fingerprint; text only with `RESONANCE_CAPTURE_PROMPT_TEXT=1` | journal | never |
| File paths | project-relative, secret patterns excluded | journal | **never** (hashed ids only) |
| Project folder name | with `resonance.shareProjectName` (default on) | receiver state | player project list only; never drawn on the Stage or OBS view |

Receivers older than v0.3 stored typed text. Since v0.3 the receiver drops inserted text even if an old extension sends it; existing journals from v0.2 may still contain it — delete them (below) if that matters.

## Boundaries

- The receiver binds to loopback by default and refuses other interfaces unless `RESONANCE_ALLOW_REMOTE=1`. Requests need a localhost `Host` header; cross-origin requests are refused (DNS-rebinding protection).
- Writes require the bearer token in `~/.code-resonance/receiver-auth.json` (mode 0600), compared in constant time.
- Read endpoints return only derived data: hashed module and symbol ids, symbol types, cue types, counts and controls. Tests check that typed text, file paths and secrets planted in source never appear in any public endpoint or in the page.
- Paths with traversal, absolute paths, excluded directories (`node_modules`, `.git`, `dist`, …) and secret-like names (`.env*`, keys, credentials, `*.pem`, …) are rejected by both extension and receiver, which share one rule set. Dot-paths are excluded unless `resonance.includeHidden` is on. Filtering is not proof that content is clean: **do not capture repositories you have not reviewed.**
- HTTP responses send `no-store` and `nosniff`; the player uses a self-only CSP and no CDNs.
- The Claude Code adapter never writes to stdout and always exits 0, so it cannot alter Claude's decisions. It is installed per project in `.claude/settings.local.json`, which is not committed.
- No analytics, telemetry, accounts, cloud APIs or remote model calls.
- Not a boundary against other local users with access to your home directory or against malware running as you.

## Erasing data

Stop the extension and receiver, then delete `~/.code-resonance/projects/<hash>/` for one project, or `~/.code-resonance/` for everything (including the receiver token). Also clear the extension's outbox in VS Code's global storage (`.../globalStorage/zerobandwidth.code-resonance/outbox`) and any agent spool in `~/.code-resonance/spool/`. Nothing is copied anywhere else.

Report vulnerabilities privately to the repository owner; do not attach recordings that may contain secrets.

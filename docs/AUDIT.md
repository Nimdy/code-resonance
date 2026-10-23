# Code Resonance — v0.2.0 audit and corrections

Audit of commit `07a2695` (v0.2.0), October 2026. Each finding was reproduced with a probe, a test, or a run in
the real environment before it was changed. The tests added for each fix fail against v0.2.0.

## Baseline

| Check | Result |
|---|---|
| Repository vs. source package | 44 of 45 manifest files byte-identical; `.gitignore` missing (restored from the original ZIP; all 45 now verify) |
| `npm run check` | pass |
| `npm test` | 20/20 pass |
| `npm run package:vsix` | **fails without the `zip` binary** (CI passed only because GitHub's Ubuntu image has it; PowerShell unsupported) |

## Findings

Severity: **P0** privacy or data loss · **P1** wrong interpretation or unusable at scale · **P2** quality or claims.

| # | Sev | Finding | Evidence | Resolution |
|---|---|---|---|---|
| 1 | P0 | Every edit's inserted text (up to 8000 chars per change) was written to `events.jsonl` in plaintext, **even with `captureDocumentContents=false`**. The engine never read it. | Probe: pasted `AKIA-…` key found in journal; VS Code run: typed marker in journal | Extension sends per-second `document.edits` counts; receiver drops `changes[].text` from old clients (`2c1f299`) |
| 2 | P0 | One event the receiver rejects (e.g. path > 300 chars) returned HTTP 422 forever and blocked **all later capture**. Extension and receiver exclusion rules had drifted. | Probe: later valid events never delivered | Quarantine permanently rejected batches; receiver keeps valid siblings; shared exclusion rules (`ff5bbca`) |
| 3 | P1 | Call sites were keyed by line number: inserting one blank line scored **+6.90 progress**, 3.5× a new React component. | Probe; real repo: 12,850 "created" symbols for 300 added functions | Stable keys; per-kind credit; locals/call sites earn nothing; saturation; validated refactors (`83b08fc`) |
| 4 | P1 | `state.json` grew to **39.8 MB** and was rewritten every window; `GET /api/project` took **308 ms** on the main thread every 3 s per viewer; RSS 1 GB. | Excalidraw (448 files), simulated hour | Recorded `performance.jsonl`, cached views, throttled checkpoints: 7.6 MB, 3 ms, 312 MB (`ef156ab`) |
| 5 | P1 | Replay covered only the last 160 windows / 500 cues; frame boundaries depended on scan timing, so re-interpretation was not reproducible. | Code + test | Windows from receiver-stamped `receivedAt`; byte-identical rebuild; full-history replay (`ef156ab`) |
| 6 | P1 | Music: at chapter 2, three palettes produced **4 distinct bars in 30 minutes**; all projects shared one progression; accents fired off-grid on poll arrival (up to 35 at once). | Score probe; code | Composition v2 + quantized performer (`748c27f`) |
| 7 | P1 | Event-to-player latency up to ~24 s (10 s windows, 3 s grace, 10 s scans). | Timing analysis | 5 s / 1.5 s / 1 s → fixed ~10.5 s performance delay (measured worst case ~9.9 s) (`6769020`) |
| 8 | P1 | Visible graph = first 900 nodes in insertion order; Nexus showed 70 of 450 modules; Nebula overexposed to white; layout reshuffled when a module was added. | Chromium screenshots on real data | Importance-ranked projection; stable growth layout; density-normalised light (`6769020`, `bb0f769`) |
| 9 | P1 | Tests run in a terminal (and by AI agents) were never recognised; only VS Code task names were. | VS Code run | Local command classification, category only (`2c1f299`) |
| 10 | P2 | `resonance.includeHidden` was documented but unimplemented. | Code | Implemented (`2c1f299`) |
| 11 | P2 | Diagnostics debounce dropped URIs from earlier events; tension accumulated +0.05 per diagnostics event and saturated while typing. | Code + test | Accumulate URIs; tension computed from current state (`2c1f299`, `83b08fc`) |
| 12 | P2 | Any HEAD change (checkout, reset) was reported as a commit. | Code | Commit only when the previous HEAD is a parent (`2c1f299`) |
| 13 | P2 | `deliver()` returned immediately while another delivery was in flight, so `close()` could exit without flushing. | Probe + test | Shared in-flight promise (`ff5bbca`) |
| 14 | P2 | Hook CLI computed project ids as `'file://'+root`, which differs from VS Code for spaces, reserved characters and Windows drives. | Compared with `vscode.Uri.file` in a real extension host | `sdk/project-id.js` (`6358b7c`) |
| 15 | P2 | OBS overlay never started audio. | Chromium | `?overlay=1&sound=1` (`bb0f769`) |
| 16 | P2 | Offline renders silently dropped soft voices (all pads) after ~72 notes: the voice budget relied on `ended` events, which offline contexts do not dispatch while scheduling. Found by the 30-minute session render. | Session render; test fails on the old code | Budget by scheduled end time |

## Documentation claims that were stronger than the implementation (v0.2.0)

- "provider-specific hook ingestion": there was one generic CLI and no provider adapters.
- "Weighted milestones distinguish meaningful structural progress from typing noise": undermined by finding 3.
- "Source snapshot capture can be disabled": true for snapshots, but typed text was still stored (finding 1).
- "Live / Replay … time scrubbing": limited to recent windows (finding 5).
- "test outcomes influence harmony": only VS Code tasks, and only by a semitone shift when tension > 0.57.
- `REPOSITORY.md` described a ChatGPT session and a Git bundle that are not part of this repository.

## Known remaining risks

See `docs/QUALIFICATION.md` for what is verified, where, and what is not.

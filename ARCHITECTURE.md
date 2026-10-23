# Architecture and engineering boundaries

Code Resonance is a listener and interpreter—not a code editor, test runner, AI agent, or autonomous code writer. It never executes captured source. It turns observed activity into a recorded performance that a separate player renders as music and visuals.

```
VS Code extension (workspace host)        Agent hooks (Claude Code) / event CLI
  handlers only enqueue; durable outbox     opt-in, explicit, category + counts only
                 \                               /
                  ▼                             ▼
            127.0.0.1 receiver  ── bearer token, Host/Origin checks, per-event validation
                  │  stamps receivedAt (monotonic) and appends
                  ▼
     events.jsonl (raw observations, append-only)  +  blobs/ (gzip snapshots, content-addressed)
                  │
            worker thread (1 s scans)
                  │  5 s windows from receivedAt · AST diff · interpretation (reducer)
                  ▼
     performance.jsonl (recorded timeline: frame + cues + graph delta per window, keyframes)
     state.json (checkpoint) · public.json (cached view)
                  │
            GET /api/project · /api/timeline   (cached in memory, ETag)
                  │
               player ── one performance clock (live = now − ~10.5 s, replay = playhead)
                 ├── score.js   composition (pure, deterministic)
                 ├── music.js   Web Audio performer, offline renderer
                 └── app.js     worlds, scheduling, replay, recording, export
```

## Data authority

1. **Observations** are identified, timestamped and durably stored before any analysis (`events.jsonl`, blobs). They are never rewritten.
2. **Interpretations** (symbols, cues, progress, tension, frames) are derived and versioned (`INTERPRETATION_VERSION` in `engine/reducer.js`). When the version changes, a project's derived files are rebuilt from its journal. Inferred cues carry `category: 'inferred'`.
3. **Validation** means the observed command exited 0. It is not a claim that the software is correct.
4. **AI provenance** defaults to `unknown`. A change is attributed to an agent only when it follows that agent's own hook-reported tool event for the same file within 60 s (`attribution: 'correlated'`). Hidden reasoning cannot be inferred and is never claimed.
5. **The taxonomy only grows.** Event kinds are added, never repurposed, so old journals stay interpretable.

## Determinism and replay

- Windows derive from the receiver's `receivedAt`, never from when a scan happens to run. A forced flush is itself recorded in the journal (`control.window.close`), so forced cuts replay too.
- Re-interpreting a journal reproduces `performance.jsonl` byte-for-byte (tested). Frames appended after the last checkpoint are truncated on restart and regenerated identically.
- The score is a pure function of the project seed, frame state, bar index and palette; bars are anchored to the performance clock. `ResonanceMusic.renderOffline` renders a recorded performance without real-time playback (used for WAV export and audio qualification).

## Timing

Window 5 s, grace 1.5 s, worker scan 1 s. Measured from posting to the recorded timeline: median 5.1 s, p90 6.3 s, max 6.4 s; the extension outbox adds up to 2.5 s and the player poll up to 1 s. The player uses one fixed delay (window + grace + scan + 3 s ≈ 10.5 s), so every event plays at its true relative time and sound and image share one clock.

## Performance boundaries

- Editor handlers only enqueue. Typing is summarised per file per second; snapshots are debounced (1.2 s) and capped at 150 KB; the outbox persists batches every 500 ms and delivers every 2 s.
- The outbox quarantines permanently rejected batches, holds back the baseline index until a receiver is reachable, and caps queued content at 256 MB.
- The receiver main thread serves cached projections and byte-indexed timeline pages; parsing, AST analysis and projection happen in the worker. Measured on a real 448-file project after an hour of simulated edits: `GET /api/project` 3 ms, sort per window 61 ms, `state.json` 7.6 MB.
- The public graph shows every module (up to 700) and fills a 1400-node budget with the most meaningful symbols. Canvas2D with pre-rendered glow sprites and batched edge paths.

## Next technical milestones

1. Native Windows and macOS qualification; OBS Studio browser-source test with audio.
2. More agent adapters (where products expose hooks) and correlation by tool-use ids.
3. Language coverage beyond JS/TS (Python, Go, Rust parsers or LSP symbols).
4. A WebGL/WebGPU renderer with bloom behind the same graph contract, keeping Canvas2D as fallback.
5. Offline audiovisual (video) export from the recorded timeline.

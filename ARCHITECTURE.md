# Architecture and engineering boundaries

Code Resonance is a listener and interpreter—not a code editor, test runner, AI agent, or autonomous code writer. It never executes captured source. It observes changes and transforms safely bounded derived signals into a long-running visual and musical performance.

```
VS Code [workspace host]             Other supported AI agent hooks
  | non-blocking event handler            | explicitly authorized events
  v                                       v
Durable outbox --> 127.0.0.1 receiver <--- authenticated HTTP
                          |
                  append-only JSONL
                   content-addressed
                   gzip snapshots
                          |
                  sorter worker (~10s)
                          |
              AST change + provenance cues
                          |
                project chapter + score
                   /               \\
           sanitized graph        bounded frames
                  |                    |
            Visual worlds        Web Audio sequencer
                   \\                 /
                       player / OBS
```

## Data authority

1. Observed activity is identified, timestamped and durably stored before analysis.
2. AST symbols, categorized cues and project progress are **inferences** derived from that observed evidence. Inference confidence is explicit.
3. Build/test success means *the observed process or task completed successfully*, not that an application is secure, correct, or deployed.
4. AI provenance defaults to `unknown` unless a provider-specific hook supplies a trustworthy correlated event; hidden model reasoning cannot be inferred from ordinary file changes.
5. Score decisions are reproducible given the same project seed, control frames, bar index and palette. Audio playback scheduling depends on the real browser audio clock and is not a sample-accurate offline export.
6. Each visual world receives only the same sanitized hashed graph IDs, entity type and weights. None accesses raw files, agent text or command strings.

## Performance boundaries

- VS Code callbacks call `outbox.enqueue()` only. No parsing or UI rendering in editor handlers.
- Disk-backed outbox retry prevents lost events during a temporary local receiver outage.
- Receiver token is local. Event ingestion size and allowed record fields are constrained.
- Source snapshots are compressed and deduplicated. They are resolved and interpreted inside a Node worker, not in the browser.
- The browser uses Canvas2D and Web Audio with modest, bounded event/graph sizes; controls change musical parameters on bar boundaries.
- Replay projection currently saves 160 recent graph snapshots, rather than expanding every journal event to a full historical graph in RAM.

## Future technical milestones

1. Real VS Code + WSL and Linux extension-host acceptance with artificial workload; confirm safe disk queue drain and no noticeable editor latency.
2. Provider adapters for formally supported Codex/Claude hooks, with opt-in visible thinking summaries only.
3. First-class normalized call/dependency graph beyond currently supported JS/TS static expressions.
4. More language parsers, LSP semantic integration, and development-stage vs. live-stage provenance correlation.
5. Long-form historical replay from checkpoints with bounded memory, robust capture expiry/deletion, and true offline audiovisual export.
6. A high-end WebGPU visual renderer as an optional backend, retaining the current Canvas2D fallback.

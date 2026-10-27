# Changelog

## 0.3.0 — Qualified capture, meaningful interpretation, a composed performance

Audit findings and evidence: `docs/AUDIT.md`. What was verified, and where: `docs/QUALIFICATION.md`.

- **Privacy:** typed text is no longer captured or stored (it was, even with content capture off); per-second edit counts instead. Command lines are classified locally into categories. `resonance.includeHidden` now works.
- **Reliability:** a rejected event can no longer stall capture; valid events in a batch are kept; outbox flushes on close, waits for a receiver before indexing, and has a disk budget; torn journal lines are repaired.
- **Interpretation (v4):** stable symbol keys (no line-number churn); credit by meaning, saturating for bulk; validated refactors and recovered tests are milestones; tension from current state; terminal and agent test runs count; commit vs. checkout distinguished; recalibrated chapters.
- **Recorded performance:** deterministic windows from `receivedAt`, append-only `performance.jsonl` with graph deltas, full-history replay, automatic rebuild when the interpretation changes, cached views (3 ms vs 308 ms on a real project), ~10.5 s performance delay.
- **Agents:** Claude Code hook adapter (`npm run hooks:claude`); correlated attribution; distinct voices; project ids that match VS Code exactly.
- **Music:** composition v2 (identity, sections, call and response, motif development, tension/resolution, event figures) and a mixed, quantized performer with offline rendering.
- **Player:** one performance clock for sound and image; growing layouts; pulses at the module that changed; beat- and section-aware worlds; OBS `?overlay=1&sound=1&project=`; WAV export; project names in the selector.
- **Extension UX:** status-bar menu (start/stop, Stage, OBS view, prompt).
- **Build:** VSIX packaged with Node only (no bash/zip). Qualification harnesses for VS Code, Chromium, audio and a 30-minute real-code session.

## 0.2.0 — Standalone Code Resonance

- Removed Signal/3 naming and integration dependency. New versioned independent performance interface.
- Introduced independent deterministic musical score and real Web Audio sequencer with Ambient, Pulse, Cinematic, and Chip palettes; bar-quantized frame transitions and adjustable musical controls.
- Added Nexus, Monolith (isometric architecture), and Nebula worlds driven by the same anonymized project model.
- Added browser WebM performance recording, clean OBS overlay and persisted player settings.
- Kept the original local-first VS Code capture, durable outbox, semantic sorter, agent hook, event journal and replay.
- Added pure score tests, browser smoke verification workflow, private publishing instructions and revised security documentation.

## 0.1.0 — Code Instrument prototype

- Loopback receiver, local semantic event interpretation, Canvas2D audition, snapshot replay and extension capture.

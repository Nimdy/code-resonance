# Security review: visual pack runtime and recording (product hardening)

> **Historical:** the security review of PR #5 (product hardening), as written then. Since 0.5.0 (PR #7) every
> administrative request also needs a control capability from a paired browser, not only the page's origin (the
> "Receiver API from the frame" row). The current model: [SECURITY.md](../../SECURITY.md) and
> [packs/security.md](../packs/security.md).

Scope: what this milestone changed or depends on: the pack frame and worker, the content policy, the messages between
player, frame and worker, digests and approvals, revocation and modification, shaders, navigation, and live recordings.
Method: reading the code paths below, then attacking them with hostile fixtures in a real browser
(`qualification/visual/robustness.qual.js`, `visual/pack.qual.js`) and unit/HTTP tests. Chromium only.

| Area | What was checked | Finding | Action / evidence |
|---|---|---|---|
| Where pack code runs | A pack's code in the frame's page could block the player's page when it hung (measured in Chromium) and could navigate the frame or use WebRTC | real | Pack code now runs in a dedicated worker inside the frame (SDK 1.1): no DOM, no navigation, no WebRTC; a hang blocks only the worker. Robustness: the player kept 60 fps during a hang |
| Sandbox | `sandbox="allow-scripts"` on the iframe (opaque origin); embedding restricted by `frame-ancestors` to the receiver's own origins | the page relied on the attribute alone | The frame's policy now also carries `sandbox allow-scripts`: opaque origin even when the page is opened on its own (`tests/pack-receiver.test.js`) |
| Content policy | `connect-src 'none'`; scripts only from `/worlds/` and `/vendor/` and `blob:`; `worker-src blob:` (needed for the worker, which inherits the policy) | no gap found | Probes from the worker and from the frame: fetch, XHR, WebSocket, beacon, image, prefetch, `import()`, `importScripts` (receiver API and outside), nested workers' network, IndexedDB, Cache Storage, cookies, popups, parent: all blocked, outside listener received nothing |
| Receiver API from the frame | The receiver answers the frame's opaque origin only for the public modules; API endpoints need a localhost Host header; POSTs need the same origin | no gap found | `tests/pack-receiver.test.js`; DNS rebinding is refused by the Host check |
| Messages: player ← frame | Only `ready`, `loaded`, `rendered`, `stats`, `picked`, `error` from the frame's own window; statistics sanitised (numbers, short strings, one level); labels capped; acknowledgements for requests never made are ignored | bitmaps were not size-bounded | Frame bitmaps over 4096×4096 pixels are refused (a film frame then fails explicitly) |
| Messages: frame ← worker | The relay forwards only known types and transfers only bitmaps | a worker could flood the relay | Over 1,000 messages a second: the frame terminates the worker and the pack is stopped (robustness: the probe's 5,000 spoofed messages) |
| Messages: player → frame | Everything passes the privacy-safe view (`view.js`, whitelists, planted-secret test) | `postMessage(…, '*')` is required for an opaque origin: if the frame ever navigated, messages sent before the player noticed would reach the new page | Pack code cannot navigate (worker); the frame's own page does not; a navigation is detected on load and stops the pack. Residual: a browser bug |
| Digests and approval | Approval bound to the digest of the exact files; the receiver serves only recorded files whose hash still matches | the player trusted what the receiver served | The player now checks every file's SHA-256 and the set's digest before anything reaches the frame |
| Modification while running | The receiver's pack registry cached by installation record and trust file only | a file changed after installation went unnoticed by a running receiver (never served, but the running pack kept running) | Cache key now includes every file's size and time; the player polls every 5 s and stops the pack ("files changed after approval"); robustness: stopped 3.7 s after the change, file refused (HTTP 403) |
| Revocation while running | Player polled every 10 s | slow | 5 s; robustness: stopped 4.5 s after revocation |
| Receiver outage | What the player concludes when the pack list cannot be fetched | an unreachable receiver read as "no packs": a running pack was stopped as "removed", and the world rebuild that followed failed on the network and was treated as "no WebGL" (the player fell back to the Construct for good) | Unreachable now means "unknown, retry": nothing is stopped, the world rebuild waits and returns with the receiver (robustness: 201 ms after it returned). Revocation still applies on the first answer |
| Shaders | GLSL compiled in the worker's WebGL context | a hostile shader can hang the GPU or crash the driver; GPU timing side channels | Not preventable by a browser sandbox (documented, never promised). Context loss stops the pack; the hang watchdog covers a stalled GPU frame |
| Resource exhaustion | An approved pack can burn CPU, memory or GPU until stopped | a stuck worker keeps a core busy ~2 s after its frame is removed (Chromium's termination grace), plus the 6 s detection | Documented; approvals remain a trust decision |
| Recordings | What the compositor draws; the audio source; the file name; where it goes | no gap found | Only the stage (world and labels in the chosen label mode; packs supply their composited stage) and the music output (no microphone); file name carries a hash prefix, not the project name; saved locally as a download. Labels pass the privacy rules (pack qualification privacy check) |
| Test hooks | `?qual=1` exposes qualification hooks | page-local; cross-origin pages cannot reach them; they do nothing the page's own controls cannot | none |

Remaining risks (also in `docs/packs/security.md`): GPU shaders cannot be sandboxed; side channels; browser bugs in the
sandbox, policy or worker isolation; an approved pack can waste resources until the watchdog acts; not a boundary
against malware running as the user. Isolation was verified in Chromium only (not Firefox, Safari or OBS's CEF).

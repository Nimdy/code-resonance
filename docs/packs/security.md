# Security model for visual packs

Code Resonance's player runs on the receiver's own origin, next to your project data. A visual pack never runs code
there. Data packs and code packs are treated differently.

## Declarative packs (data only)

Validated against the schema and the base family's catalogue (types, ranges, effect polarity), then applied to the
recipe's genome on the receiver. They contain no code (validation rejects any `.js` or GLSL file in them), so they need
no approval. Their strings (name, author, description) appear only in the Control Center, as text, never on the Stage.

Since SDK 1.2 a declarative pack may carry an Artist Studio composition (a creation). It is validated against the
composition model's allowlists (six layer types, the listed signals and targets, clamped values, at most 8 layers within
a rendering budget of 100), normalised on the receiver, and drawn by the built-in layer runtime on the player page. It
cannot reference files, URLs or code, and never runs in the pack frame.

## Shader and world packs (code)

1. **Installed unapproved.** `scripts/pack.js install` copies the files into `<data>/packs/<id>/` and records each file's
   SHA-256 and a digest of the whole pack. Nothing runs until you approve.
2. **Explicit approval of exact files.** `scripts/pack.js approve <id>` or the review in Visual Packs shows the author,
   every file with its size and hash, the digest and the limits below. The approval (in `<data>/packs/trust.json`, mode
   0600) is bound to that digest. Any change to any installed file is detected (the pack is reported as modified, no
   longer counts as approved and its files are no longer served); reinstalling different files drops the approval.
   Approvals come only from your command line or from a paired Control Center (a request that carries a control
   capability and the digest you saw; see [SECURITY.md](../../SECURITY.md)).
3. **Served as inert text.** The receiver hands out a code pack's files only after approval, as `text/plain` with
   `nosniff` and a sandboxing content policy, so they cannot execute in the player's origin.
4. **Isolated frame, code in a worker (SDK 1.1).** The player creates `<iframe sandbox="allow-scripts">` for the pack:
   an opaque origin (no access to the player, its storage or cookies, no popups, no forms, no top navigation) whose
   content policy is `default-src 'none'; connect-src 'none'; script-src <the public world modules> blob:; worker-src
   blob:; frame-src 'none' …` and whose permissions policy denies camera, microphone, location, clipboard, USB, serial,
   HID, Bluetooth, payment and display capture. The frame's page runs no pack code: it starts a dedicated worker from a
   `blob:` URL (so the worker inherits the frame's content policy), hands it the canvases as `OffscreenCanvas`, and
   relays only known message types in both directions. The pack's code arrives from the player as text, after the
   player has checked every file against its approved SHA-256 and the set against the approved digest, and runs in that
   worker from `blob:` URLs. A worker has no DOM, cannot navigate the frame and has no WebRTC. The receiver answers the
   frame's opaque origin only for the public world modules and three.js (the script policy names those two paths); every
   API request from it is refused.
5. **Bounded and watched.** Every frame is acknowledged, at most one is in flight, and the player validates what comes
   back (only pixels, label strings and plain statistics, sanitised; acknowledgements for requests it never made are
   ignored). The pack is stopped for the session when its code throws, it stops answering for 6 s, it delivers under
   1 fps, its GPU context is lost, its worker floods the relay (over 1,000 messages a second: the frame terminates the
   worker), its frame navigates, its approval is revoked, or its installed files change (noticed within 5 s; a changed
   file is never served). The player shows the identity without it; nothing restarts on its own.

The compatibility tests verify points 1, 4 and 5 from inside a real frame and from inside the pack worker: fetch,
XHR, WebSocket, `sendBeacon`, images, prefetch links, dynamic import and `importScripts` (receiver API and outside),
nested workers' network access, popups, WebRTC, IndexedDB, Cache Storage, cookies, the DOM and the parent, aimed at the
receiver and at an outside listener that must receive nothing. `qualification/visual/robustness.qual.js` drives the
hostile fixtures in `packs/testing/` (a probe that tries all of this from the worker and then floods the relay, a pack
that hangs, one that throws, one that loses its GPU context, one far too slow) and revokes, modifies and navigates
running packs.

## The performance view

Everything sent to a pack frame passes through `public/worlds/view.js`, built from explicit whitelists (unknown fields
are dropped, so data added to the timeline later never reaches a pack by accident): graph nodes (salted ids, types,
counts, layout, states), dependency edges, cues (types, times, salted ids, counts), intents (types, tiers, evidence,
salted subject ids; intent ids, which embed client-chosen event ids, are replaced by hashes), the recipe (genome,
aggregate traits, the viewer's settings, and only the public strings you approved: the public title and subsystem
aliases), and the mood. Never: file names, paths, source, prompts or responses, terminal commands, the project's folder
name, the project or session ids, the receiver token, recordings or other projects. A test plants secrets in every
field and checks none comes out (`tests/pack-view.test.js`).

## What the browser cannot guarantee

Be clear about the limits before approving a pack:

- **GPU shaders cannot be fully sandboxed.** A hostile or buggy shader can hang the GPU, crash the tab or the graphics
  driver (and with it other applications), or exploit driver bugs. Browsers mitigate (shader validation, watchdog
  resets) but do not prevent this.
- **Side channels.** GPU and CPU timing can leak coarse information between pages.
- **Ways out of the frame.** Since SDK 1.1 pack code runs in a worker, which cannot navigate the frame or use WebRTC,
  the two channels a content policy cannot close for a document. The frame's own page (Code Resonance's relay, no pack
  code) is still watched: a frame that navigates is stopped. Browser bugs remain possible; what could travel is only
  what the frame holds: the privacy-safe performance view.
- **A hung pack costs CPU for a few seconds.** A worker stuck in a loop is detected after 6 s; Chromium then
  force-terminates it about 2 s after its frame is removed (measured), so a hostile pack can occupy one CPU core for
  roughly 8 s per approval or **Retry**. The player and the page stay responsive meanwhile (measured).
- **Not a boundary against malware running as you**, or against other local users with access to your home directory.

So approval is a real decision: approve only packs from authors you trust, as you would any program you run.

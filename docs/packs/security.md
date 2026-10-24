# Security model for visual packs

Code Resonance's player runs on the receiver's own origin, next to your project data. A visual pack never runs code
there. Data packs and code packs are treated differently.

## Declarative packs (data only)

Validated against the schema and the base family's catalogue (types, ranges, effect polarity), then applied to the
recipe's genome on the receiver. They contain no code (validation rejects any `.js` or GLSL file in them), so they need
no approval. Their strings (name, author, description) appear only in the player's panel, as text, never on the Stage.

## Shader and world packs (code)

1. **Installed unapproved.** `scripts/pack.js install` copies the files into `<data>/packs/<id>/` and records each file's
   SHA-256 and a digest of the whole pack. Nothing runs until you approve.
2. **Explicit approval of exact files.** `scripts/pack.js approve <id>` or the player's REVIEW dialog shows the author,
   every file with its size and hash, the digest and the limits below. The approval (in `<data>/packs/trust.json`, mode
   0600) is bound to that digest. Any change to any installed file is detected (the pack is reported as modified, no
   longer counts as approved and its files are no longer served); reinstalling different files drops the approval.
   Approvals come only from your command line or from the player page itself (same-origin request with the digest you
   saw).
3. **Served as inert text.** The receiver hands out a code pack's files only after approval, as `text/plain` with
   `nosniff` and a sandboxing content policy, so they cannot execute in the player's origin.
4. **Isolated frame.** The player creates `<iframe sandbox="allow-scripts">` for the pack: an opaque origin (no access
   to the player, its storage or cookies, no popups, no forms, no top navigation) whose content policy is
   `default-src 'none'; connect-src 'none'; script-src <the public world modules> blob:; worker-src 'none'; frame-src
   'none' …` and whose permissions policy denies camera, microphone, location, clipboard, USB, serial, HID, Bluetooth,
   payment and display capture. The pack's code arrives from the player as text and runs from `blob:` URLs. The frame
   removes WebRTC before any pack code exists. The receiver answers the frame's opaque origin only for the public world
   modules and three.js; every API request from it is refused.
5. **Stopped on misbehaviour.** An exception in pack code, or the frame navigating itself away, stops the pack for the
   session; the player shows the identity without it.

The compatibility tests verify points 1, 4 and 5 from inside a real frame: fetch, XHR, WebSocket, `sendBeacon`,
images, prefetch links, dynamic import, workers, popups, WebRTC, storage, cookies and the parent document, aimed at the
receiver and at an outside listener that must receive nothing.

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
- **Ways out of the frame.** The content policy cannot stop a frame from navigating itself, and some browser features
  sit outside it. Code Resonance stops a pack whose frame navigates, and removes WebRTC, but a single navigation
  request may already have left. What could travel is only what the frame holds: the privacy-safe performance view.
- **Not a boundary against malware running as you**, or against other local users with access to your home directory.

So approval is a real decision: approve only packs from authors you trust, as you would any program you run.

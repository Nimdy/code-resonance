# Changelog

## Unreleased

Interpretation **10** (9 in 0.7.2): on its first start the receiver rebuilds each project's derived files once from its
journal. No existing identity changes: recipe traits still count only the v9 language categories, and every JS/TS file
keeps its v9 structure and test flag. The extension's part (below) reaches VS Code with a rebuilt VSIX.

- **Web demo:** a no-install page for GitHub Pages (<https://nimdy.github.io/code-resonance/>, live once Pages is
  enabled) that opens on the Performance Stage replaying the public recording *Lumen Recipes* in the real player, with
  its music after a click, in any of the five world families, the Construct or Monolith, at 1×, 4× or 16×; it also
  plays on a phone. `npm run site` (`scripts/build-site.js`, Node only) starts a receiver in-process on a temporary
  copy of the recording (a free loopback port), exports every read-only answer the Stage needs for a replay to
  `site/api/` with a manifest, and copies the player beside them; the same recording builds the same files byte for
  byte (3.5 MB). The static mode (`public/web-demo/`, included only in the site's page) answers `/api/*` from those
  files, keeps every `POST` inert, stubs the change feed and leaves out what needs a receiver (Control Center, live
  mode, pairing, saving). `.github/workflows/pages.yml` builds and deploys it on pushes to `main` and by hand, never on
  pull requests; the owner sets *Settings › Pages › Source: GitHub Actions* once. Checked by `tests/web-demo.test.js`
  and, in a real browser, `qualification/site/web-demo.qual.js`. [docs/WEB-DEMO.md](docs/WEB-DEMO.md).
- **Relative URLs in the player:** its dynamic module imports (`public/app.js`, the Visual, Artist and Packs
  workspaces) and the workspaces' stylesheets (`public/ui/dom.js`) are relative, so the page works under any path. The
  receiver serves the same files at the same URLs as before.
- **The extension alone is enough.** The VSIX now carries the receiver (receiver, engine, player, Control Center,
  vendored three.js and TypeScript, hook adapters: about 2.9 MB, 170 files). When capture starts or the Stage opens and
  no receiver answers on `resonance.receiverPort`, the extension starts it: a separate, detached process bound to
  `127.0.0.1`, run with VS Code's own runtime (VS Code's Electron with `ELECTRON_RUN_AS_NODE=1` on the desktop, the VS
  Code Server's `node` in WSL/SSH windows), logging to `logs/receiver.log` in the data directory. Every window reuses
  it through the token proof, and two windows starting at once start one (a lock file). A receiver that already
  answers (`npm start` or `npm run up` in a checkout, another window) is always used and never replaced or stopped;
  another program on the port, or a receiver of the same data directory on another port, means nothing is started and
  the extension says why. A newer extension replaces the receiver an older one started; an older one keeps using a
  newer receiver. New commands: *Receiver Status*, *Stop Receiver*, *Show Receiver Log*, *Open Control Center (Pairing
  Link)*; new setting `resonance.startReceiver` (on). The **Code Resonance** Output channel records each decision.
  `npm run up`, `npm start` and the repository's flows are unchanged.
- **Agents from the extension.** *CR › Connect an AI agent…* adds or removes the observe-only Claude Code, Cursor or
  Codex hooks for the workspace through the receiver's own plan and apply (the Control Center's rules), after showing
  the exact change in a diff editor. The receiver the extension starts keeps the hook adapters in `hooks/` in the data
  directory, a path that survives extension updates, and the hook entries it writes name that path.
- **Marketplace and Open VSX, prepared:** icon, banner, links, keywords and a README written for the extension's page;
  the VSIX manifest now follows vsce (its identity `Id` is the extension name with the publisher apart, where it was
  `publisher.name`; tags, gallery flags, links, branding, changelog and icon assets; a content type for every file
  extension). Not published: the steps are in [docs/PUBLISHING.md](docs/PUBLISHING.md).
- **The extension honours `RESONANCE_DATA`** in VS Code's environment, like the receiver, the hooks and the command-line
  tools (it always read `~/.code-resonance` before).
- Qualification: `qualification/vscode/bundled.js` runs the VSIX's own extension folder in a real VS Code with no
  receiver running (two windows, isolated profile, a free port).
- **Languages:** dependency-free adapters for Go, Rust, Java, Kotlin, C#, Swift, C and C++ (headers too), PHP and
  Ruby, over a shared lexer that blanks strings and comments in place (`engine/languages/scan.js`). Each recognises its
  types, members, functions and globals, and framework routes with a literal path: net/http (Go 1.22 patterns) and
  gin/echo/chi/fiber; axum, actix and rocket; Spring, Micronaut, JAX-RS and Ktor; ASP.NET attributes and minimal APIs;
  Vapor; Crow; Laravel, Slim and Symfony; Rails and Sinatra. A construct a scanner cannot read reliably yields no
  symbol; each adapter's header says what it leaves out.
- **Imports between modules:** Go import paths under a go.mod module resolve to a file of the package directory (the one
  named after it, never a `_test.go`); Rust `mod`/`use` follow the 2018 module rules, and Cargo.toml crate names link a
  workspace; Java and Kotlin packages resolve by folder (src/main/java beside src/main/kotlin); C# namespaces are
  candidate folders only; `#include` resolves beside the file and in the enclosing include/ folders; PHP `use` through
  composer.json PSR-4 prefixes; Ruby `require_relative`; Swift `import` to Sources/<Module>.
- **Deeper Python:** Protocol and ABC classes are interfaces; TypedDict, `X: TypeAlias`, `type X =` and NewType are
  types; Django `path()`/`re_path()` (urls.py or urlpatterns), Flask `add_url_rule`, FastAPI `add_api_route` and
  Starlette `Route()` are routes, and a route decorated inside an app factory is a route. 555 of the 574 files of the
  Python 3.12 standard library analyse exactly as before; the other 19 differ only by these kinds.
- **Tests as validation:** each language's convention marks its test files (`_test.go`, Rust `benches/`, `src/*Test/`
  for Java and Kotlin, `*Tests.cs` and `*.Tests/`, `_spec.rb`, `*Test.php`, Swift `Tests/`, `_test.cc`, `test_*.py`,
  `*_test.py`, `conftest.py`).
- **Language mix:** `languageOf` adds java, kt, cs, swift, c, cpp, php and rb; the performance view passes them to packs
  instead of `other`.
- **Extension:** `SOURCE_GLOB` covers every analysed file type plus go.mod and Cargo.toml (one flat brace group, as VS
  Code globs do not nest braces); the command classifier knows the new toolchains' test, build, lint, typecheck,
  format, install and run commands.
- **Not verified:** Rust, Kotlin and Swift were checked on fixtures only (no real code in those languages was available);
  the glob was checked against the glob parser of the installed VS Code server, not in a running VS Code.

## 0.7.2 — 2026-10-29

Product 0.7.2, for use on your own machine; not stable. Interpretation **9** (8 in 0.7.1): on its first start the
receiver rebuilds each project's derived files once from its journal (below). This tag is `v0.7.2`. The VS Code
extension is 0.7.2 (`code-resonance-0.7.2.vsix`); a receiver started before this release has no v2 token proof, so
restart it after updating. Synaptic Storm and Fractal Continuum are previews, chosen only explicitly in the Visual
Studio; no existing identity changes.

- **License:** Code Resonance is released under the MIT License ([LICENSE](LICENSE)); it was unlicensed before. The
  included three.js (MIT) and TypeScript (Apache-2.0) keep their own licences
  ([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)). The VSIX carries the licence as `extension/LICENSE.txt`.
- **Synaptic Storm (preview):** a fourth built-in world family, chosen only explicitly (Visual Studio, marked
  *Preview*; the render lab's `--family synaptic-storm`). Subsystems are clusters of glassy neurons placed by a force
  layout over the real dependencies, files are dendrite branches, symbols boutons, dependencies axons; agents travel as
  signals in their CAST colour and shape and make the neuron of the file they edit fire; tests sweep activation waves,
  failures misfire and dim their neighbourhood, recovery resynchronises, and a verified milestone with the director's
  token, at least 4 minutes after the last, earns a synchronous storm. Idle firing sits on the score's beat grid. Never
  part of the family scores: the recipe generator stays at version 4 and every existing identity is unchanged
  (`tests/recipe.test.js` as pinned; `tests/synaptic.test.js` new). `/api/catalog` lists it under `previews`. No
  digital life yet. Design brief and stills: `docs/worlds/synaptic-storm.md`.
- **Fractal Continuum (preview):** a fifth built-in world family, chosen only explicitly (Visual Studio, marked
  *Preview*; the render lab's `--family fractal-continuum`). One raymarched, distance-estimated fractal: the code's
  character picks its universe (Mandelbulb, Julia bulb, Mandelbox or kaleidoscopic crystal) and its parameters from the
  identity's own stream, and the live code unfolds its recursion. Subsystems are regions of the surface that swell with
  their files, files are sites of light traced onto it with a JS twin of the estimator, dependencies are threads of
  light; agents travel as signals in their CAST colour and shape and ripple the surface around the file they edit;
  tests send a coherent wave, failures make the covered region decohere in the warning colour, recovery restores
  coherence, a commit glows from the crevices, and a verified milestone with the director's token, at least 4 minutes
  after the last, earns a fractal bloom. Idle: breathing, a circling light, glints and pulses on the beat grid. Drawn at
  0.6 of the resolution at quality 0 (less at 1 to 3, and when it fills the frame) in a coarse cone pass, a march and a
  shading pass; measured 15–20 ms GPU per frame at 1920×1080 on the AMD iGPU over the brief's stills on Lumen, up to
  25 ms in a close-up that fills the frame (Self). Never part of the
  family scores: the recipe generator stays at version 4 and every existing identity is unchanged (`tests/recipe.test.js`
  as pinned; `tests/fractal.test.js` new). `/api/catalog` lists it under `previews`. No digital life yet. Design brief
  and stills: `docs/worlds/fractal-continuum.md`.
- **Synaptic Storm up close:** each axon now ends in a synaptic terminal, a glass bell of vesicles facing a cup on the
  receiving branch; a spike's arrival sparks across the cleft and the vesicles at the mouth cross it. Branches are
  seamless tubes (consecutive segments share their joint, free ends are rounded) whose trunks swell at the soma, with a
  web of fine filaments and gold specks on their membranes and gold beads along every fibre; somas have lobed
  membranes, organelles and a bright nucleus inside two shells. A recorded event the director gives attention is seen
  up close, an agent's work in a medium close-up. The detail is drawn only where it is large enough on screen to read,
  and not at quality 3. Behind the network, the far tissue: out-of-focus fibres with bokeh nodes in every direction
  (atmosphere, never code; about 1–2 ms on an integrated GPU at 1080p). The render lab takes `--after` (seconds after
  each event, with `--events`). The brief's stills are now rendered on a GPU.
- **Several agents at once:** sessions of the same tool running together are numbered in public labels and the hover
  card (*Claude*, *Claude 2*; the lowest number free, so a lone session is just *Claude*). The README and the first-run
  guide explain running several agents on one project (two Claude Code terminals, Cursor chats, Codex): hooks once per
  project and tool, each session its own presence; agents without hooks are not presences, their edits arrive
  unattributed. `tests/agents-multi.test.js` new.
- **Fractal Continuum with more than 24 subsystems:** every subsystem now has a region of its own. The 25th subsystem
  and later reused the first 24 directions, so two subsystems were drawn as one region with their names on top of each
  other (VS Code's 49 built-in extensions, indexed as a project: 49 regions on 24 directions). The sequence of
  directions now continues past 24; its first 24 are bit-identical (4,000 seeded sequences compared), so a project with
  24 subsystems or fewer looks exactly as before. `tests/fractal.test.js`.
- **Synaptic Storm without dependencies:** the world no longer stops with an error while nothing in the project links
  yet (a new project, or the first moments of a replay or film from the start: `Cannot set properties of undefined
  (setting 'needsUpdate')` since the preview was added). `tests/synaptic.test.js`.
- **Fractal Continuum, review fixes:** the layout follows every birth and removal exactly (it was rebuilt at most once
  a second, so a file born mid-second appeared late when played through but at once when sought); waves, recoveries,
  glows and blooms stay on their own file when a new file reorders the layout; files missing from the model leave no
  stale position for threads and composition anchors; an attributed edit ripples and flares in one agent's colour. The
  swell table keeps each region's kernel and sums only the swell again while a project grows (it was rebuilt almost
  every frame, 26 ms at 49 subsystems; byte-identical output), and the first bloom's 3,200 surface traces run on the
  world's first frame instead of the milestone's. `tests/fractal.test.js`.
- **Labels keep clear of each other:** when two agents work side by side their chips no longer print over each other
  or over an event's callout (each takes the first free place around its agent, or its old one when none is free); in
  explorer mode a subsystem's name steps down or up from the others and is left out where every place is taken (the
  hover card still names it). `tests/privacy-labels.test.js`.
- **Visual Studio, preview worlds:** they show a thumbnail rendered from the project like the three; their state reads
  *In design* (no longer "Preview" beside "Previewing"); the strip shows a peek of the card past its edge at every
  width (at 1920×1080 the fifth world was hidden); a preview world's panel says that look packs and the Artist Studio
  are for the three flagship worlds, instead of sending you to Visual Packs.
- **Films:** a render that fails ends at once instead of waiting forever on its encoder (and keeping its copy of the
  data in `/tmp`); with no frames rendered, `--out` is left as it was.
- **Public repository:** REPOSITORY.md no longer calls it private; SECURITY.md says how to report a vulnerability
  privately (GitHub's private vulnerability reporting); the README's hero caption says the Cursor and Codex events in
  that film were posted through their adapters, Claude was a live session.
- **Hover details:** resting the pointer on the living world, wherever a view shows it (the Stage, Home's live
  preview, the studios, Record & Broadcast), shows a small card beside the pointer: the world's own words for what is
  there, then what the player knows there at that moment (agents at work or that used a tool there and how long ago,
  the newest test verdict and edit, a subsystem's file count and states). At most ten picks a second; it keeps clear
  of the Stage's controls and hides on leaving, any key, scrolling, dialogs, a resting Stage, touch input and the
  information modes Stream and Off. It is page markup over the stage, never drawn into it: recordings, films and the
  OBS view never contain it. Catalog and generated names only.
- **Agent touches:** each edit an agent makes now shows in the flagship worlds for a few seconds (an edit's tool event
  lasts milliseconds, so the presences never visibly reached the file). Fractal Biosphere: the branch flares in the
  agent's colour, a pulse runs up it into the crown and a ring opens at its tip; Stellar Forge: the world flares with a
  ring, its orbit lights and a streak runs from the comet; Machine Cathedral: the tower's windows light in a quick
  cascade, a glint and a halo ring at the top. Reads and searches are gentler. Rate-limited per file, at most four at
  once, a pure function of the recorded presences (replays, seeks and films show the same), presentation only (never
  the director, the recipe or digital life). Swarms and servitors visit the file they just touched and burn brighter
  while they work; comets brighten.
- **Explorer:** clicking a structure also draws the camera a little toward it (the world's own goal, the same rig).
- **Packs:** the pack frame takes no pointer input; explorer clicks and the hover reach a pack's world through the
  player (`pick`, `peek`). A pick no longer counts as a frame in flight (it held back renders and could trip the
  watchdog).
- **Render lab:** `--touch` renders stills during the first recorded edit and read (`qualification/visual/lab.js`).
- **Stellar Forge:** "0 dependencies" (it said "dependencys").
- **Worlds:** the choices are now Living world, The Construct and Monolith. Nexus and Nebula, two Canvas 2D stages,
  are retired. A setting or project preference that names one still loads as Monolith (the receiver never rewrites a
  file for reading it; the document's next write stores Monolith), and a URL pin `?world=nexus` or `?world=nebula`
  (an OBS bookmark) shows Monolith. A new write that asks for a retired world is refused (400, `stage.world` or
  `world`). Recipes and packs are unaffected.
- **Monolith** is redrawn as a flat architectural elevation of the site plan (`public/worlds/monolith.js`): files are
  towers on their persisted plots, storeys their symbols, districts in the project's palette, dependencies as arcs
  below the ground line, with a public title, counts and a district legend. Motion is calm and follows the cues;
  reduced motion stills it. An unchanged frame is copied from a cached layer: on a 450-file project in headless
  Chromium with software rendering, 18 ms of script per second while idle (0.7.1's Monolith: 164 ms).
- **Generated subsystem names** (`generatedName`) move from `host.js` to `labels.js`, unchanged, so the 2D world can
  use them without three.js.
- **Token proof for every client, bound to the port:** the extension's capture outbox, the Claude Code, Cursor and Codex
  hooks, `scripts/event.js` and `npm run demo` now verify the receiver before they send `Authorization`; in 0.7.1 only
  `npm run up`, `npm run pair` and the extension's pairing link did. The proof is now
  `GET /v1/challenge?nonce=&v=2` → HMAC-SHA256(token, `cr-challenge-v2|<port>|<nonce>`) for the port the request arrived
  on, and no client follows a redirect, so a process on one port can no longer pass by redirecting to, or relaying, a
  real receiver on another port. The outbox verifies once per receiver connection (again after a failed delivery or a
  changed port); the hooks and CLIs once per run. An unverified occupant gets nothing: hooks spool and exit 0, the
  outbox keeps its batches (status *queued (receiver not verified)*), the CLIs exit with an error. One client
  implementation, `extension/proof.js` (now in the VSIX), re-exported by `receiver/proof.js`.
  **Compatibility:** the receiver still answers the 0.7.1 form (`?nonce=` without `v`) for an extension installed
  before. A receiver started before this change has no v2 proof: restart it. Until you do, the updated hooks spool and
  the extension queues their events, and `scripts/event.js`, `npm run demo`, `npm run up` and `npm run pair` refuse.
- **Interpretation 9 (projects rebuild once):** the `agent.collision` cue now weighs 0, like every other agent cue. In
  8 it weighed its magnitude (0.4–0.6) and fed progress, energy and the chapter, so two agents on the same files raised
  an existing project's chapter on rebuild; now a two-agent journal has exactly the progress and chapter of the same
  journal with one provider. Collisions count only catalogued providers (Claude, Cursor, Codex, Grok, Qwen, Kimi):
  `unspecified`, `external-agent` and other ids still attribute their edits but never make a meeting. The catalog
  lookup ignores Object members (`constructor`, `__proto__`, …). On the first start each project's derived files are
  rebuilt from its journal (the journal is not rewritten). The collision intent and its magnitude are unchanged, so the
  living worlds' meeting and the score's accent figure are as before; a window with a meeting now has slightly lower
  energy and growth (they summed cue weights), and the Canvas 2D stages pulse it at their base speed.
- **Public agent names:** an agent whose provider id is not in the catalog is "Agent" on Stage chips, in collision
  callouts (Biosphere, Stellar Forge, Machine Cathedral) and in Home's Last night cast, instead of its title-cased id
  (`external-agent`, a client's name passed with `--provider`). The Control Center's own lists still name the id.
  Visual packs receive a provider only as a catalog id (it was any lower-case slug).
- **Highlights cannot stall the receiver:** the picker (`engine/highlight.js`, `GET /api/highlight`, `npm run film`)
  scored every candidate window by scanning it; a failure recovered more than 24 minutes later made every intent of the
  red period a candidate, so the cost grew with the square of the history, on the receiver's main thread (measured:
  5.0 s for 50,000 intents with a 6.8-hour red period). It now scores the same candidates with one sliding pass per
  kind: the same night takes 48 ms, a million intents 0.5 s, a million with 200 failures, a six-hour red period and
  40,000 anchors about a second. The choice is unchanged: the tests compare it with the 0.7.1 picker on the existing
  fixtures and 600 seeded random nights.
- **Last night is the last day:** the highlight is chosen from the last 24 hours of the project's own recording
  (measured from its last window), and from the whole history only if nothing there scores; the receiver then parses
  only those windows. Home asks for it at most once per 30 s per project, and again only after the project's recorded
  performance grew (it asked on every project update while there was none, and never refreshed one it had).
- **`npm run film` ends cleanly:** a failure after the temporary receiver started (a software renderer where a GPU was
  asked for, a refused look or tune, a browser that would not launch, a failed frame) left it and the ffmpeg encoder
  running, so the command never returned; now every failure stops them. The temporary copy of the data directory
  (with `receiver-auth.json`) was removed only on a normal exit; now also on Ctrl-C, SIGTERM and SIGHUP, and the wrapper
  passes a signal on to the renderer and waits for it. A GPU the wrapper detected itself (no `--gpu`) that the browser
  cannot use now falls back to software with a message instead of failing; `--gpu auto|amd|nvidia` still insists.
  `--gpu` accepts only `auto`, `amd`, `nvidia` or `off`.
- **Hook installers:** removing the Codex adapter from the Control Center (or merging it again) left its handler in
  place when it shared a group with one of your own hooks (the group count did not change, so the event looked
  untouched); it is now removed and your hook stays. The Connections plan and apply for Claude Code, Cursor and Codex
  refuse your home directory and anything that resolves to it: `~/.claude`, `~/.cursor/hooks.json` and
  `~/.codex/hooks.json` are user-level and run in every workspace. A project folder inside the home directory is fine.

## 0.7.1 — 2026-10-28

Product 0.7.1, for private use on your own machine; not stable. Interpretation **8** is unchanged. The last published
GitHub Release before the 0.7 series was `v0.6.0`. This tag is `v0.7.1`. The VS Code extension is 0.7.1
(`code-resonance-0.7.1.vsix`).

- **Ecology CI:** Biosphere, Stellar Forge and Machine Cathedral each run as their own Node test file so the 120 s
  suite timeout no longer cancels them on 2-core GitHub runners. Assertions and Cathedral's 20 Hz sampling are
  unchanged. The global `--test-timeout` is still 120 s.
- **Pairing proof:** `GET /v1/challenge?nonce=` returns HMAC-SHA256 of the ingestion token over a client nonce.
  `npm run up`, `npm run pair` and the extension verify that proof before they send `Authorization`. A leftover
  occupant that only mimics `/health` (even with a planted `receiver-auth.json`) never receives the Bearer token. A
  receiver from before 0.7.1 has no challenge: restart it.
- **Agent outcomes:** Claude, Cursor and Codex omit `exitCode` and `result: succeeded` for Bash when the hook payload
  has no numeric exit. `PostToolUseFailure` still parses `Exit code N`. Edit/patch completion still records success
  from the after-hook firing.
- **Highlights:** `inWindow` is a binary search on sorted timestamps. `GET /api/highlight` caches by
  `performance.jsonl` mtime and size.
- **Labels:** agent chips and explorer labels stay inside the frame (flip, then omit). Overlay drawing clamps measured
  boxes.

## 0.7.0 — 2026-10-28

Product 0.7.0, for private use on your own machine; not stable. Interpretation **8** (CAST seats from the provider
catalog, `agent.collision` when two providers share a file or district inside 60 s) is independent of this product
version. The last published GitHub Release at the time was `v0.6.0`. The VS Code extension is 0.7.0
(`code-resonance-0.7.0.vsix`).

This version is the CAST campaign stack: first-run, the CAST catalog, Cursor and Codex observe-only adapters, Home Last
night and the publish film path, and the operator runbook. The README hero is a 70-second CAST session of Pulse.
Overnight CAST and a public OBS night remain. [docs/campaign-0.7.md](docs/campaign-0.7.md).

### First run (`npm run up`)

- `npm run up` (~60 s): probe 4174, reuse a Code Resonance receiver or start one, refuse a foreign occupant (no token
  write, no pairing, no browser), print a pairing link, build the VSIX, optionally install and open, post a labelled
  fictional demonstration only if there is no real project yet.

### CAST catalog (interpretation 8)

Interpretation 8 is named independently of product 0.7.0. Rebuilding derived files from a journal follows the
interpretation version, not the product version.

- Provider catalog: Claude, Cursor, Codex, Grok, Qwen, Kimi on stable seats 0–5; unknown ids hash into seats 6–7.
- Stage chips show catalog names. Worlds draw CAST presences in the project's grammar (fireflies, comets, servitors);
  no vendor art styles.
- Last-writer still attributes an edit; two providers on the same file or district inside 60 s emit `agent.collision`
  (an intent plus a derived cue). Worlds express it; they never invent one.

### Cursor observe-only hooks

- Project `.cursor/hooks.json`. After-hooks only. **Never** `subagentStart` (a permission hook: empty stdout denies
  Task spawn). Prove only in a trusted workspace. Connections: `POST /api/integrations/cursor/{plan,apply}`.
- Adapter never persists edit hunks, command lines or command output.

### Codex observe-only hooks

- Project `.codex/hooks.json`. **Never** `PreToolUse` or `PermissionRequest` (they can deny). Paths only from patch
  headers. Prove only when the project `.codex/` layer is trusted. Connections:
  `POST /api/integrations/codex/{plan,apply}`.
- `ACTIVITY.apply_patch = editing`. Adapter never persists patch hunks, command lines or tool output.

### Last night and films

- Deterministic highlight picker (`engine/highlight.js`, `GET /api/highlight`): Home **Last night** is a sped-up replay
  of that window (default 4×; 16× when the scored window is long). Playwright is not involved.
- `npm run film` is the publish path: always `--copy`, default cinematic labels, title-gated, default out
  `qualification/results/films/last-night.webm` (never committed). Play still works without a public title; a film does
  not (unless `--allow-untitled`). Uses a hardware GPU when one is present (`--gpu auto|amd|nvidia`; `--gpu off` is
  software).
- Visual Studio **Propose public names** fills aliases from role plus `generatedName` (`Craft - Vauos`); writes only on
  Accept. The hyphen is required because aliases reject a middle-dot.

### Campaign runbook

- Operator checklist for one overnight CAST session, a morning reel, a 60–90 s README hero, and a later public OBS
  night. The README hero is the 70 s Pulse CAST film (`docs/media/code-resonance-cast.mp4`). Overnight CAST and a public
  OBS night remain.

## 0.6.0 — 2026-10-27

The first tagged release, `v0.6.0`: four milestones built on 0.5.0 and the final consolidation, integrated into `main`.
For private use on your own machine; not stable. The VS Code extension is 0.6.0 with the same code as 0.5.0 (only its
version changed), so reinstalling it is optional. The product version is separate from the versions of the data formats,
the score, the Visual Recipe generator, digital life and the Visual Pack SDK, which these milestones did change: they
are listed, with the rules that keep existing identities as they were, in
[ARCHITECTURE.md](ARCHITECTURE.md#versions-and-compatibility).

### Final consolidation

No intended change of product behaviour. The pull-request stack is integrated into `main` with merge commits
([integration manifest](docs/history/integration-manifest.md)).

- **Documentation:** an index ([docs/README.md](docs/README.md)) with a map of the history by pull request; a current
  operations guide (`docs/OPERATIONS.md`) in place of the 0.4.0 alpha notes, which move to `docs/history/`; the
  getting-started guide covers the creative workflows; ARCHITECTURE is the developer guide with the versions table and
  the HTTP API; SECURITY covers Artist Studio compositions; historical records are labelled; SDK 1.2 is named as current.
- **A test** keeps the Control Center's documents, the receiver's allowlist and every Markdown link consistent
  (`tests/docs.test.js`).
- **Code:**
  - Removed dead code: Cathedral layout helpers unused since life grammar v3, the score's uncalled `pitch()`, unread
    bindings, unused CSS, the Construct's leftover state, and two orphaned composition wording helpers. Score and
    composition output is unchanged; the digests are pinned.
  - One source per module system for the music vocabulary (styles, profile keys, mix groups, tempo limits), with
    parity tests. The Music Studio reads room sizes from the engine.
  - One reduced-motion rule and one copy of the information-mode descriptions.
  - The pure quality governor now lives in `public/worlds/quality.js`; the composition export helpers in
    `public/ui/creations.js`, which also styles the export dialog in Visual Packs; the Claude Code hook format sits
    with its installer.
- **Fixes:**
  - A stopped receiver no longer holds Node open for 10 s.
  - A preview that settles after the Artist Studio is left no longer re-sets the draft.
  - The 2D stages' ripple backlog is bounded.
  - The per-frame state no longer hashes the whole ecosystem to read the quality level.
  - A test no longer leaks temporary folders.
- **Validation hardening:**
  - Composition layer types and pack base families are looked up as own keys only (`constructor` was accepted or
    crashed).
  - Values that cannot become a number or a string no longer crash validation.
  - Validation reports at most 24 problems.
- **Tooling:**
  - `npm run check` finds its files itself (`scripts/check.js`, proven to cover the old list).
  - CI jobs have timeouts with margin and run on pinned `ubuntu-24.04`.
  - The parameter catalogue is regenerated for SDK 1.2 and guarded by a test.
  - Personal machine paths are removed from tracked qualification reports.

### Creative mastering and the Artist Studio (PR #11)

Music that develops, digital life that answers it, cinematic finishes, and a workbench for original compositions. Built
on the digital-life branch. Existing identities keep their sound and image until deliberately upgraded: new behaviour
sits behind versions (recipe generator v4, score v3, ecology 2).

- **Composed score (v3)** (`public/score.js`, `public/music.js`, [docs/MUSIC.md](docs/MUSIC.md)):
  - Long-form arcs: statement, development, interlude, return and release.
  - Antecedent and consequent phrases built from the project's motif, with a second idea per arc.
  - Voice-led harmony with sevenths, ninths and a resolving suspension; a guide-tone countermelody; a bass that walks
    or holds a pedal.
  - Roles that enter and leave at passage boundaries; dynamics that breathe.
  - Four styles with their own characters.
  - New voices: a pre-delayed room kept out of the bass, band-limited pulse waves for chip, a kit per style.
  - The low end rebalanced by arrangement rather than EQ.
  - Measured on a recorded session: loudness range 1.6–3.7 LU (v2) to 5.5–12 LU (v3) at about −23 LUFS.
- **Music Studio:**
  - Character controls: mood, evolution, melody, rhythm, atmosphere, harmony, dynamics, space.
  - A balance (level and mute) for each voice the style can sound.
  - Four curated starting points; presets that keep the profile.
  - A one-click upgrade to the composed score.
- **Musical expression for the visuals** (`public/worlds/musical.js`): the score's conducted state read from recorded
  frames on the shared clock, never from the audio device.
- **Ecology 2** ([docs/LIFE.md](docs/LIFE.md)): music shapes conditions, not choreography. That means currents,
  gathering, exploration, persistence, light, rhythmic pulses and a turning attractor. Each world interprets them its
  own way:
  - Biosphere: migrations between crowns, beyond the dominant organism.
  - Stellar: density waves and streams, with no faster rotation.
  - Cathedral: convoys on the musical grid, routes and lit channels.

  The music also shows in each world's light, in its inhabitants' brightness, size and traces (presentation only,
  from the relaxed conditions). Music influence 0 is exactly neutral and renders exactly as before; 1 is musical; 2 is
  expressive. Against music 0 at the same moment, the picture's systematic swing went from 0.05–0.87 to 2.0–4.7 at
  music 1 and 4.6–9.7 at music 2 (luma sd), with no flicker.
- **Finishes** ([docs/WORLDS.md](docs/WORLDS.md)): Clean, Cinematic (the default for new identities) and Dreamlike, in
  the existing composite pass.
  - An optical chromatic aberration: radial, spectral, highlight-sensitive.
  - Fringe on the bloom, halation, split toning that keeps the blacks, and mist.
  - Classic is bit-identical to before.
- **Artist Studio** (`#/artist`, [docs/ARTIST-STUDIO.md](docs/ARTIST-STUDIO.md)): compositions of procedural layers
  over a flagship world or the minimal artist canvas.
  - Six layer types: fractal geometry, particle populations, ribbons and flow, geometric structures, atmospheric
    fields, light accents.
  - Anchors on the project's own structure, honest depth classes, and reactive mappings from musical, canonical
    engineering and environmental signals.
  - Preview in one window, save with versions, apply to a project.
  - Export and import as data-only declarative packs (SDK 1.2): nothing executable, validated, no private data.
  - Four creator starters and a blank canvas. A layer that fails is set aside with its reason; the rest keeps drawing.
- **Control Center:**
  - Home: Create a composition, and Continue.
  - Visual Studio: Finish, chromatic aberration, a Phase 11 upgrade, and Open in Artist Studio.
  - Visual Packs: My creations, Imported creations and looks, Shader packs, Full coded worlds.
  - Projects: Composition, Finish and Music profile rows.
- **Reference packs:** Ember Observatory 1.1.0 and Blueprint Cathedral 1.1.0, clearer over the flagship worlds.

### Digital life (PR #10)

Autonomous inhabitants in the three flagship worlds ([docs/LIFE.md](docs/LIFE.md)). Built on the desktop experience.

- **A deterministic ecosystem** (`public/worlds/life/`): entities with inertia and bounded steering on a fixed step,
  shared fields they deposit into and sense (trail, energy, disturbance, momentum), sites with conditions, bounded
  lifecycles that reuse their slots. Checkpoints restore exactly; every frame rate and every seek path reaches the same
  state.
- **Three ecologies:** in the Fractal Biosphere pollinators, spores, plankton colonies and drifters gather on the
  organisms' crowns and move on; in the Stellar Forge dust streams, accretion fragments, charged motes and stellar wind
  follow the galaxy's rotation and density waves; in the Machine Cathedral couriers, wardens and sparks travel the
  city's own routes, never through stone.
- **Engineering, not choreography:** canonical intents become bounded site conditions (novelty, nourishment, strain, a
  vortex after a validated refactor, a lasting attractor for a verified milestone); a failure scatters life and a
  recovery lets it return. Inhabitants never stand for agents and are never labelled.
- **The music's climate:** the score's sections on the performance clock shape the conditions; *Music influence*
  (`life.music`, 0 to 2) sets how much, and 0 keeps them neutral.
- **Replays and films** live in generations of ten minutes, so a far seek is bounded; the next generation is prepared in
  the background and handed over with a crossfade. A live session keeps its population through tempo changes and folds
  its inputs to bound its memory.
- **Recipe generator v3** adds `life` to new built-in identities from its own random stream (every v2 value
  unchanged). Stored identities have no life until the Visual Studio's *Digital life* switch turns it on; life off
  renders exactly as before.
- **Auto quality** also steps down when the GPU timer misses part of a slow frame (Stellar Forge at 1920×1080 on the AMD
  integrated GPU: High at 19 fps before, Low at 57 fps after).
- **Qualification:** `visual/life.qual.js`, `life-perf.js`, `life-cpu.js` and `life-music.js`; `unchanged.qual.js`
  compares the worlds with life off; films kept locally.

### Desktop experience (PR #9)

The Control Center redesigned for desktop screens, from 1280×720 to 2560×1440. Built on the flagship worlds.

- **Type and layout:** a readable type scale (body 14 px, nothing under 12 px), a wider rail, top bar and inspector,
  and pages that use the screen's width (up to 2400 px).
- **Workspaces:** Home gives the live world most of the screen beside the project, its evidence-based status and its
  actions; Projects lists projects beside the selected one's timeline, sessions, validations, agents and configuration;
  the Visual Studio's world fills the main column, with an inspector grouped by creative purpose and Cancel and Apply
  pinned; the Music Studio brings the live monitor, the musical identity, the styles and the performance controls into
  one workspace; Visual Packs is a filtered library beside a pack inspector (identity, approval, parameters, files and
  digests); Connections and Settings put status beside guidance; Record & Broadcast shows a large recording preview;
  the Stage's navigation is clearer.
- **One recorder:** a window records only while it holds an exclusive Web Lock, so Record pressed in two windows at
  the same instant starts exactly one recording (20 of 20 rounds).
- **Auto quality** steps down within about 2 s of slow frames, straight to a usable level when they are far too slow,
  and climbs only after a stable period (longer after a failed attempt), using the GPU time where the browser reports
  it, without recompiling shaders. When no level draws smoothly it says so and offers Monolith; it never switches the
  world by itself.
- **Fixes:** no text under 12 px; toasts never cover a pinned inspector footer.
- **Screenshots** of every workspace at four desktop sizes, before and after (`docs/desktop/`).

### Flagship worlds (PR #8)

The three built-in living worlds rebuilt as flagship worlds, each a different universe with its own visual grammar.
Built on 0.5.0.

- **Fractal Biosphere:** a bioluminescent reef grown from the code. Recursive crowns (sea fans, pinnate fronds, polyp
  buds, photophores), species chosen from the project's data, blight on failing branches only, recovery that regrows
  them, phyllotactic milestone blooms that stay, rhizome cords between connected organisms, a sediment floor and
  migrating light shafts (`public/worlds/biosphere.js`, `biosphere-growth.js`, `biosphere-glsl.js`).
- **Stellar Forge:** a galaxy at scale with a bulge, dust lanes, grand-design spiral arms and nebulae; subsystems are
  beacons in its arms (a hard core, a diffraction cross, an emission knot sized by the subsystem); failure raises dark
  dust pillars around the strained systems, recovery dissolves them, milestones are novae whose remnant shells stay in
  the disc around their star.
- **Machine Cathedral:** needle spires on black water under a moon; windows light for live work, orreries turn,
  links are bridges of light, failure cracks the stone and darkens the windows from the top, recovery relights them,
  milestones gild the great spire and leave halo rings.
- **Cinematic grade options** for worlds and packs (`grade()`): AgX tone mapping, screen-space light shafts,
  anamorphic streaks and tinted halation; all off by default, so packs render exactly as before.
- **Generator v2:** Fractal Biosphere species come from the project's traits; Machine Cathedral gains light shafts and
  wetness from a separate random stream. Every value generated by v1 is unchanged.
- **Visual Studio:** each world says why to choose it; six curated looks (two per world, built in, read-only) preview
  and apply like presets; an Essentials group holds the few parameters that change a world the most.
- **Stage:** the Stage button shows the active world.
- **Fixes from review:** after a seek, the first event brings the world up to date at its time before its effect is
  placed (Replay from here on a marker showed a nova at the origin, or no sprout); a newborn organism's sprout now plays;
  Biosphere blooms are bounded (24 per organism, 400 in all); agent swarms and Stellar planets no longer depend on frame
  history; Stellar's galaxy survives a shader pack's background, and no light shafts point at a sky a pack replaced;
  Visual Studio controls start from what an older Cathedral recipe renders. `updateMs` counts afterCamera's offscreen
  passes as drawing, as `docs/packs/performance.md` defines it.
- **Qualification:** a render lab (`qualification/visual/lab.js`) for stills of a world on real project data at
  recorded moments; flagship screenshots (`qualification/ui/world-shots.js`, `docs/worlds/spectacle/`).

## 0.5.0 — the Creative Control Center (not released)

Code Resonance becomes an application: a Control Center to configure and operate it, and an immersive Performance
Stage, on the same engine and the same authoritative state. Built on 0.4.0 alpha 1; not stable, not released.

### The application

- **Workspaces:** Home (is it running, is capture really active, what needs attention, a resumable setup guide),
  Projects (browser, statistics, timeline with replay from any moment, agents, validations, exports), Visual Studio,
  Music Studio, Visual Packs, Connections, Record & Broadcast, Settings, and the **Performance Stage** (`#/stage`:
  controls fade, full screen, a second window for another monitor). Replaces the three-column player. The OBS view
  (`?overlay=1`) and existing bookmarks keep working.
- **One engine:** `public/app.js` exposes `window.ResonancePlayer`; the stage is placed over whichever view shows it
  (never a second renderer, scheduler or clock in a window) and pauses drawing while no view shows it.
- **Visual Studio:** choose → preview (never saved, shown in this window only) → customise → apply (checked against
  the recipe revision; a change made elsewhere meanwhile is reported). Parameters are generated from the parameter
  catalogue and from pack manifests (world-pack parameters, shader-pack uniforms), validated by the receiver;
  customising locks the identity; *Reset customisations* restores the generated values. Real thumbnails of the
  built-in families rendered from the project. Visual presets.
- **Music Studio:** style, tempo (the project's or manual), texture and volume per project or globally, heard live as a
  preview before applying; the project's musical identity (key, mode, tempo per style, motif); music presets. The WAV
  export now uses a manual tempo when one is chosen.
- **Visual Packs:** import from a `.zip` or a folder through the browser (quarantined, validated by the SDK's own
  checks, installed unapproved), review files and digest, approve, revoke, remove, read READMEs and the SDK guides.
- **Connections:** the receiver's health; per project, what VS Code capture was really observed and the capture
  settings the extension reported; Claude Code activity, and adding or removing its hooks after showing the exact change.
- **Record & Broadcast:** recording profiles (720p, 1080p, stage size), one recorder shared by every control and one
  recording at a time across windows, the OBS URL builder, exports.
- **Settings:** global preferences, this device's quality, where each kind of configuration lives, diagnostics.

### Receiver

- **Configuration authorities:** `settings.json` (global), per-project `preferences.json`, `presets.json`; versioned,
  validated, written atomically; field-level patches; `409` for a stale revision. The player's previous browser
  preferences move to the receiver once.
- **Change feed** (`GET /api/changes`, server-sent events): every window, the Stage and the OBS view converge.
- **Capture evidence** per project from the journal (`GET /api/evidence`).
- **Control capabilities and pairing:** administrative routes need a capability, issued only to a loopback request
  of the page's origin that presents the pairing key from `receiver-auth.json`, which a browser gets once through a
  single-use pairing link (`npm run pair`). Previously recipe edits
  and pack approvals needed only the page's Origin, which any local process can forge.
- **Recipes:** revisions, batches, previews, `tune` / `tune-reset`; a project's information mode follows the global
  setting until one is chosen for it (recipes from before 0.5 are read that way).
- **Packs:** `/api/packs/{import,install,discard,remove,readme,templates}`; a pack with problems cannot be approved;
  reserved ids (`trust.json`, Windows device names) are refused; the registry no longer answers for `constructor`.

### Extension 0.5.0

- Reports its capture settings at capture start and when they change (`workspace.settings`), values only.
- `vscode://zerobandwidth.code-resonance/settings` opens its settings; *Open Code Stage* opens a paired link.

### Qualification

- `qualification/ui/`: an isolated seeded environment (`serve.js`), one browser suite per workspace and a cross-view
  acceptance suite (first run, two projects and a receiver restart, recording across windows, OBS updates, previews
  that stay local, responsive layouts), run by `ui/run-all.js`; the existing harnesses drive the new Stage.

## 0.4.0 alpha 1 — controlled-alpha candidate (not released)

The first version meant for real developers on real projects, with the limitations in `docs/ALPHA.md`. Not stable,
not production-ready. Everything since 0.3.0:

### Alpha candidate: memory, synchronisation, recording sizes

- **Recording size:** choose 720p (1280×720, the default), 1080p (1920×1080) or the stage's size next to ● RECORD. At
  720p and 1080p the world renders at exactly that size with a 16:9 camera (packs too), so the file has those encoded
  dimensions with nothing stretched or cut; the stage shows the same picture letterboxed while recording. Video bitrate
  5 Mbit/s at 720p, 8 at 1080p. A recording that cannot keep up (under 28 frames drawn per second for ten seconds) is
  reported once, with advice. 720p is the default because it holds 30 fps on modest GPUs.
- **Memory leak fixed:** the recording's sound watchdog created an audio source node per recording that the browser
  never released (about 2-3 MB per recording in the renderer and the GPU process); it now uses one for the page.
  A finished recording is no longer held in memory for a minute after it is saved. A disposed world releases its GPU
  context at once; the pack worker reuses its compositing canvas.
- **Synchronisation fix:** in replay, sound was scheduled from the playhead of the last animation frame, so a cue
  scheduled after a main-thread stall sounded that much late (+136 to +166 ms after a 150 ms stall, reproduced); the
  playhead is now extrapolated between frames.
- **Qualification:** renderer memory forensics with a lean browser driver (Playwright's DevTools connection keeps every
  fetched response in the renderer, which had made the soak's memory unreadable), in-player bisection, blank-page
  isolation of the recorder and of worker/WebGL lifecycles; synchronisation markers v2 (a green flash and a 3-6 kHz
  chirp found by a matched filter, offsets as frame-bounded intervals, a self-test with distractors) and a matrix of
  conditions (worlds, sizes, quality, switching, CPU load, live, stalls); recording sizes measured from the files.
- **Version 0.4.0** for the first controlled alpha (`docs/ALPHA.md`).

### Product hardening: recording, bounded pack runtime, qualification

- **Live recording for every world:** ● RECORD records the presented stage (built-in worlds, declarative, shader and world
  packs) with the music through one player-owned compositor canvas and the music's own output stream; packs composite
  their frame and labels in their worker. Restart-safe (each recording clones the audio track), finishes and saves when
  a pack is stopped, explains when the browser cannot record, shows elapsed time and *NO SOUND*.
- **Visual Pack SDK 1.1:** pack code runs in a dedicated worker inside the isolated frame (a hang no longer blocks the
  player; no DOM, no navigation, no WebRTC for pack code); `sdk.util.canvas`. 1.0 packs run unchanged
  (`docs/packs/migration.md`).
- **Bounded delivery and a watchdog:** acknowledged renders, at most one in flight, skipped presentation frames counted,
  semantic messages never dropped (counted on both sides), exact film frames or an explicit error; packs are stopped on
  no answer (6 s), under 1 fps, exceptions, GPU context loss, message floods, navigation, revocation or modified files,
  with the reason shown, the built-in identity shown instead, the recipe kept, and RETRY (no automatic restarts).
- **Integrity:** the player verifies every pack file's SHA-256 and the digest before running it; the receiver notices
  files changed after installation while it runs; the pack frame's policy carries its own sandbox; frame bitmaps are
  size-bounded.
- **Quality control:** World DNA → Quality (Auto, High, Medium, Low, Lowest); a notice when a pack exceeds its declared
  budget.
- **Testing fixtures** (`packs/testing/`, not packs): slow, failing, hanging, context-loss and hostile-probe worlds.
- **Qualification:** recording (`visual/recording.qual.js`, measured from the WebM files with ffmpeg: streams, frame
  timing, sound continuity, flash/click synchronisation), runtime robustness (`visual/robustness.qual.js`), multi-hour
  soak (`visual/soak.qual.js`), OBS Studio in a disposable CI machine (`obs/obs.qual.js`), platform smoke test
  (`platform/smoke.js`), unit-suite stress runner (`unit-stress.js`). CI: reference packs, runtime and native Windows in
  the required tier; an extended tier by label.
- **First run:** `npm run doctor`, `docs/FIRST-RUN.md` (with troubleshooting), `docs/WSL.md`, `docs/OBS.md`.
- **Recording and lost sound:** an audio device that disconnects or stalls stops the music's audio clock, and the
  browser's recorder then stalls the whole file (its WebM muxer waits for sound). The recorder watches its sound (track
  ended or muted, audio clock stopped, digital silence while the music plays) and then finishes and saves the recording
  at once, with the reason.
- **Fixes:** a receiver restart stopped a running pack ("removed") and, rebuilding the world while the receiver was
  down, the player gave up the living world for the Construct for good (network failures now retry); turning sound off
  while recording threw (a removed variable); a recording started during a world switch could take a hidden canvas's
  size (320×180); a pack's stop reason was lost when the identity without it loaded; the mood was posted to packs every
  frame (now on change); the two intermittent `npm test` failures (a planted secret colliding with random hex ids;
  cleanup hooks removing a receiver's directory before stopping it).

### Visual Pack SDK 1, long histories, privacy

- **Visual packs** change how a project looks without changing Code Resonance: declarative (data only), shader (GLSL
  background and post passes) and world (a complete world family). A JSON schema shared by editors and the receiver,
  parameter catalogues with effect polarity (a failure can never be shown as a success), installation with per-file
  hashes and a digest, approvals bound to that digest, tamper detection; `scripts/pack.js` (new, validate, install,
  list, approve, revoke, remove, test, catalogue). Packs with code run in an isolated frame with no network, never in
  the player's origin; the player's REVIEW dialog shows author, files, digest and the isolation limits.
- **Reference packs** written from the documentation only: Cymatic Field (a fourth world family), Blueprint Cathedral
  (shader), Ember Observatory (declarative); starter templates; SDK documentation in `docs/packs/`.
- **Long histories:** exact replay of histories up to 1,000,000 intents with bounded, checkpointed state (early
  milestones, agent numbers and departed sessions were lost before).
- **Privacy:** the Stage never shows the project's folder name; public titles come only from a title the user sets.

### Living worlds (artistic candidates)

- **Visual Recipe (World DNA):** a persistent, versioned artistic identity per project, generated from the project's
  founding traits; keep it, regenerate it, choose another family, lock it.
- **Living-world engine** (WebGL2, HDR pipeline) with three families: Stellar Forge, Fractal Biosphere, Machine
  Cathedral. Interpretation v7: canonical performance intents, agent lifecycles, language adapters (TypeScript, Python,
  manifests). A director maps intents to effects in proportion to evidence; labels in cinematic, explorer, stream and
  off modes; adaptive quality; deterministic films; live priming with the session's history.
- **Music:** lighter low end, wider stereo, evolving pads, relaxing when the work goes quiet (same loudness).

### The Construct (candidate for visual review)

- Interpretation v5/v6: architectural districts from folder structure, a persisted site plan (nothing ever moves), stable storey order per file, building states (draft, committed, validated, stressed) localized to the files a test run or commit covers, rename-preserving identities, location on cues, salted public ids.
- The Construct: an illuminated architectural model built as the work happens (docs/CONSTRUCT.md), WebGL with a Canvas2D fallback, captions for viewers who do not code, deterministic film rendering with music.
- A real recorded project (`qualification/recordings/lumen-recipes`): editor typing and six Claude Code agents building an app, with a failing test run, recovery, integration and commits.
- Construct at scale: level of detail, quieter conduits in dense districts, merged settled conduits (450 files: 6,017 → 3,622 draw calls), and a camera that frames the site's actual outline. GPU measurements under WSL2 (`CR_QUAL_GPU=wsl`).

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

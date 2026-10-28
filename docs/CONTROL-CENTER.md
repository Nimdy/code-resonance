# The Creative Control Center and the Performance Stage

Code Resonance opens as one application at **http://127.0.0.1:4174/** (served by the local receiver). It has two
experiences that share one engine and one authoritative state:

- the **Control Center**, a workspace application for configuring and operating Code Resonance;
- the **Performance Stage** (`#/stage`), where the world fills the screen and the controls fade away.

The OBS view (`/?overlay=1…`) is the stage alone, with no interface at all; existing OBS bookmarks keep working.

## Workspaces

| Workspace | Route | What it is for |
|---|---|---|
| Home | `#/home` | Is everything running, which project is active, is capture really active, what needs attention; first-run guide; **Last night** (a sped-up highlight replay, 4× default, 16× if long); the way into the studios (Create a composition, Continue the last one) |
| Projects | `#/projects`, `#/projects/<id>` | The projects the receiver knows, their identity, statistics, timeline, agents, exports |
| Visual Studio | `#/visual` | Worlds, the Visual Recipe (World DNA), metadata-driven parameters, previews, visual presets, public title, **Propose public names** (writes only on Accept) |
| Artist Studio | `#/artist`, `#/artist/new/<starter>`, `#/artist/from/<family>`, `#/artist/edit/<id>`, `#/artist/project` | Compositions of procedural layers over a flagship world or the artist canvas, what they react to, previewed on the stage, saved with versions, applied to a project, exported as a pack ([ARTIST-STUDIO.md](ARTIST-STUDIO.md)) |
| Music Studio | `#/music` | The score a project plays (classic, or composed with a one-click upgrade), style, the composed score's character (mood, evolution, melody, rhythm, atmosphere, harmony, dynamics, space) and balance (a level and mute per voice the style can sound), tempo, texture, volume, the project's musical identity, music presets and four curated starting points; every change is previewed from the next bar, then applied to the project or the global defaults |
| Visual Packs | `#/packs` | My creations; installed packs grouped as imported creations and looks, shader packs and full coded worlds; install (zip or folder), review, approve, revoke, remove, inspect; creator documentation |
| Connections | `#/connections` | The receiver, VS Code capture evidence and reported settings, Claude Code / Cursor / Codex hooks, CAST catalog, other agents |
| Record & Broadcast | `#/output` | Recording profiles and state, the OBS browser source, exports, the `npm run film` command (not a live record) |
| Settings | `#/settings` | Global preferences, this device, storage and privacy, diagnostics, documentation (including the 0.7.0 campaign runbook) |
| Performance Stage | `#/stage` | The immersive stage: live/replay, labels, world, sound, record, full screen |

## One engine, many views

`public/app.js` is the performance engine: the performance clock, scheduling, the worlds (built-in families, the
Construct, the 2D stages, isolated packs), the music (`music.js`/`score.js`), replay, recording (`recording.js`) and
the audio export. It renders no controls and exposes `window.ResonancePlayer` (commands and change notifications).
The interface (`public/ui/`) drives it: `main.js` (shell, routing), `store.js` (receiver state), `dom.js` (controls),
`workspaces/*.js` (one module per workspace, loaded on first visit).

The stage (`#stageHost`: the canvases and, for a code pack, its isolated frame) is created once. A view that shows it
marks a slot (`data-stage-slot`); the shell positions the stage layer over the slot. The layer is never moved in the
document, so a running pack frame is never reloaded, and there is never a second renderer, scheduler or clock in a
window. While no view shows the stage and nothing records it, drawing pauses (the clock, schedule and music continue,
and a pack's watchdog is told it is paused, not slow).

## Hover details

Wherever a view shows the living world (the Stage, Home's live preview, the Visual and Artist Studios, Record &
Broadcast), resting the pointer on it shows a small card beside the pointer (`public/ui/hover.js`). First the world's
own words for what is there (`pick` and `inspect`: a branch, a world, a tower, a subsystem), then what the player knows
there at that moment (`host.js` `hoverFacts`): agents at work there, or that used a tool there in the last ten minutes,
with their CAST name, activity and how long ago; the newest test verdict and edit; a subsystem's file count and states.
Times are performance times (in a replay, as of the playhead).

It picks at most ten times a second (the latest position wins; an answer that arrives after a newer pick is dropped),
keeps clear of the Stage's bars and cards, and hides when the pointer leaves the world, on any key, while scrolling,
under a dialog or menu, while the Stage rests, and for touch input. It never takes focus or a key. It is page markup over
the stage, never drawn into it, so recordings and films never contain it; the OBS view has no interface (the engine's
`peek` answers nothing there), and with the information mode Stream or Off the card does not show. It shows generated
subsystem names and catalog names only, never a path or a file name. In Explorer a click still selects (the world's
callout, the Stage's card) and draws the camera a little toward the selection. A pack's frame takes no pointer input:
its world is picked through the player.

A second Stage on another monitor is another window of the same application (`/?project=<id>#/stage`); it has its own
engine, as every window must, and shares the receiver's state.

## Where configuration lives

| Scope | Authority | Examples |
|---|---|---|
| Global preferences | receiver `<data>/settings.json` (`code-resonance.settings.v1`) | music defaults, master volume, default world, captions, recording profile, interface motion, setup guide |
| Per-project creative configuration | receiver `<data>/projects/<hash>/recipe.json` (the Visual Recipe) and `preferences.json` (`code-resonance.preferences.v1`) | family, look pack, tuned parameters, spectacle, motion, information mode, public title, aliases, the score version (`music.score`); world, music style/tempo/texture/character/balance |
| Presets | receiver `<data>/presets.json` (`code-resonance.presets.v1`) | reusable visual and music presets |
| Compositions | receiver `<data>/compositions.json` (`code-resonance.compositions.v1`) | the Artist Studio's creations, each with its last five versions; the one a project uses is copied into its recipe (`composition`) |
| Packs and approvals | receiver `<data>/packs/<id>/`, `<data>/packs/trust.json` | installed files, digest-bound approvals |
| Temporary preview | the window's memory (and `POST /api/recipe/preview`, which never writes) | a family or parameter being tried; the Artist Studio's working copy |
| Session runtime | the window's engine | sound on, live/replay, playhead, recording |
| This device | the browser's `localStorage` | rendering quality; the pairing key and a few conveniences (last view, OBS URL options, the Artist Studio's last composition and export author), listed in [SECURITY.md](../SECURITY.md) |
| Extension-owned | VS Code settings (`resonance.*`) | capture options: read-only here, as *reported* by the extension |

Every receiver document has a schema and a `revision`, is validated on write and on read, and is written atomically.
Project settings never leak into other projects: a project's `preferences.json` only holds the values chosen for it
(`null` inherits the global value). The effective configuration a window plays is resolved in `store.js`:
URL pins (OBS bookmarks) › project preference › global setting › built-in default.

The player before 0.5 kept its choices in the browser's `localStorage`; on first start they move once to the receiver
(quality stays on the device).

## How views stay consistent

Writes go to the receiver; the receiver announces each change on `GET /api/changes` (server-sent events: `recipe`,
`preferences`, `settings`, `presets`, `compositions`, `packs`, `projects`, `activity`, `evidence`), and every open window — Control
Center, Stage, OBS view — reloads what changed. Settings and preferences are written as field-level patches, so one
window can never overwrite another window's other choices with stale values. A Visual Studio *Apply* is checked against
the recipe revision it previewed (`ifRevision`); if another window changed the identity meanwhile, the user chooses
to reload or to apply on top. Applying a change never seeks, restarts or interrupts playback: music options apply on
the next bar, a recipe updates the running world (a change of runtime — built-in family, pack world, shader look —
rebuilds the world in place). Previews and session choices stay in the window that made them; the OBS view never shows
a preview. One recording at a time: a window records only while it holds the browser's recorder lock (Web Locks, granted
to exactly one window however close two presses are, and freed at once if that window crashes); the windows also tell
each other (BroadcastChannel) so the Record controls of the others say so, and a stale announcement from a crashed window
is cleared once no window holds the lock. The scope is one browser profile and origin, where recordings are made.

## Security of administrative actions

Read endpoints return derived, privacy-safe data. Everything that changes configuration, packs or integration files
needs a **control capability**: `POST /api/session` issues one only to a request from the loopback socket (a LAN client
of a receiver started with `RESONANCE_ALLOW_REMOTE=1` gets none, whatever headers it forges) carrying the page's own
origin **and the receiver's pairing key**; it is then sent as the `X-Resonance-Capability` header, which a cross-origin
page cannot send without a CORS preflight the receiver never answers. The pairing key lives in `receiver-auth.json`
(readable by your account only); a browser receives it once by opening a pairing link (`npm start`, `npm run pair`,
VS Code's *Open Code Stage*) and keeps it, so other programs and accounts on the computer cannot change anything by
forging an Origin header. The link carries a single-use code (15 minutes) that the receiver exchanges for the key, so the
key never appears in a link or a command line. An unpaired browser can watch, play and record, and offers *Pair this
browser*. A program listening on the receiver's port while it is stopped could read a browser's stored key (see
[SECURITY.md](../SECURITY.md)). Capabilities live in the receiver's memory only (12 h, renewed on use). The OBS
view never requests one. The ingestion token (`/v1/*`) is never returned to a page. Pack imports are extracted into a
quarantine directory with the SDK's limits (file types, sizes, count, total, paths, links) and validated by the same
code as the command line; code packs are installed unapproved; approval stays bound to the exact files (digest).
See [SECURITY.md](../SECURITY.md) and [packs/security.md](packs/security.md).

## Honesty rules the interface follows

- Capture state comes from evidence the receiver recorded (`GET /api/evidence`): a VS Code session is known from its
  capture-start event; the extension does not report closing, so a quiet session is shown as unknown, not as running.
- VS Code settings are shown as the extension *reported* them (0.5+), with the time; they are changed in VS Code.
- Demonstration projects (`npm run demo`) are labelled fictional everywhere.
- Previews are labelled "Preview · not saved"; an unapproved pack never runs because it is previewed. An Artist Studio
  preview blocks recording, as a Visual Studio preview does: a recording shows what is saved.
- An atmospheric layer is labelled a screen-space field; a layer's depth (behind, integrated, in front) is the order it
  is really drawn in, and the layer stack is listed in that order.
- Recordings are saved by the browser to its downloads folder; Code Resonance keeps no video library.
- Agent chips on the Stage use CAST catalog names (Claude, Cursor, Codex, Grok, Qwen, Kimi), never vendor marks. A
  meeting of two providers is `agent.collision` only when the journal justifies it.
- The hover card says what was observed there and when (an agent's tool use, a test run's verdict, an edit); a test
  verdict is about the files the run covered, never a claim that the code is correct.
- **Last night** is a replay of a scored highlight; **Record** is live; a **film** (`npm run film`) is the publish path.
  None of them draws source, paths, prompts or folder names.

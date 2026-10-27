# The Artist Studio

The Artist Studio (`#/artist`) makes original visual compositions without code: procedural layers over one of the
flagship worlds, or over the minimal artist canvas, that react to the music and to the project's real engineering
events. A composition is data (`public/composition.js`); nothing in it is ever evaluated. Artists who want unrestricted
rendering code use the Visual Pack SDK (shader and world packs), which keeps its approval and isolation.

## What is what

| Term | What it is | Where it lives |
|---|---|---|
| **World identity** | a project's saved visual universe: its family, genome, tuning (the Visual Recipe) | `<data>/projects/<hash>/recipe.json` |
| **Composition** | an artist-made stack of layers, mappings, a finish, world values and a music profile | `<data>/compositions.json` (My creations) |
| **Applied composition** | the composition a project shows, copied into its identity (`recipe.composition`) | the project's recipe |
| **Look** | a declarative pack that retunes a world's colours, materials and light | an installed pack |
| **Creation** | a composition exported as a data-only pack, to share | a `.zip` / an installed pack |
| **Music profile** | style and performance profile (mood, evolution, rhythm …) a composition may ask for | the composition; applied to the project's music preferences |

A composition never holds a project's identity: applying "Neon Mycelium" to two projects draws the same layers, finish
and palette on two different worlds, each grown from its own code and events.

## The screen (1920 × 1080)

- **Left — Library and Layers.** *My creations* (the receiver's library, with an *Imported creations* section for
  installed creation packs), the four *Starters* and the blank canvas, and the *Worlds* to start from. Under it the
  layer stack, listed in drawing order and grouped by depth: **In front** (never hidden by the world), **Integrated**
  (depth-tested inside the world) and **Behind**; the base world (or canvas) is the bottom row. Each layer can be shown
  or hidden, soloed, moved (arrows, Alt+↑/↓, or drag; moving past the edge of a group changes its depth), renamed,
  duplicated and removed (with undo).
- **Centre — the Stage.** The real stage, previewing the working copy on the selected project's structure, music and
  recorded events. Under it, **Reacts to** (the selected layer's mappings, or the whole composition's: camera and
  finish) and **Composition** (base, finish, music profile, canvas colours). At the foot: the rendering budget, what
  the stage shows, and Versions, Duplicate, Export, Save as…, Cancel, Save and **Apply to project**.
- **Right — the selected layer.** Placement (anchor, depth, blend, opacity; an XY pad for a fixed point), then Form,
  Appearance and Motion, each with its few strongest controls first and the rest under *More*; a seeded *Variation*.
  The base world shows its palette, a few world values, digital life (including Music influence 0 / 1 / 2) and every
  other tunable value under *All world values*; the canvas shows its background, horizon and camera.

Anchors place a layer where the world has something to say: the world centre, every subsystem (one instance each, from
the real layout), one of the largest subsystems, where the work is (active region), structural nodes, the environment
boundary, the camera (screen-relative) or a fixed point. There is no free-form dragging in the 3D world: a fixed point is
set on a plan seen from above and a height.

## Mappings: what reacts

A mapping takes one signal (0..1, deterministic for a performance) and changes one numeric property of its layer:
strength with direction (negative: the other way), a response curve (linear, smooth, sharp, peaks), smoothing in seconds
and the part of the property's range it may use. Each one is said in words under it: *"Glow rises with the music's
dynamics"*, *"Intensity swells after a verified milestone"*.

- **Music**: beat, bar, phrase, section change, transition, energy, harmonic tension, melody, rhythm, release, dynamics,
  density — from the score's own expression on the performance clock, never from analysing the audio.
- **Engineering**: activity, creation, removal, failure, recovery, verified milestone, agents — only from the canonical
  intents the receiver interprets. A failure never reads as a milestone; nothing is inferred or invented.
- **Environment**: the digital life's density, field energy, currents, disturbance, coherence and trails (or the
  composition's own particle layers on the canvas).

New layers start with one tasteful mapping, and an empty list offers one-click suggestions (*Pulse on the beat*,
*Answer verified milestones* …).

## Preview, save, apply, cancel

- **Preview** is local to the window: every edit (debounced, about 150 ms) asks the receiver for a candidate identity
  (`POST /api/recipe/preview` with a `composition` action, never stored) and shows it on this window's stage. The OBS
  view and other windows keep the saved look. While previewing, recording is blocked (a recording shows what is saved);
  a composition's music profile is heard at the next bar, in this window only.
- **Save** writes the working copy to My creations (`POST /api/compositions`, `update` with the version it was opened
  at). Each save keeps the version before it — the last five are kept — so a change never destroys the previous one.
  **Versions** brings one back (the current one moves into the history). **Save as…** and **Duplicate** make a new one.
  A composition saved meanwhile in another window is never overwritten silently: load theirs, save yours as a copy, or
  replace it (theirs stays in the history).
- **Apply to project** saves first if needed, then applies the composition to the selected project as one recipe action
  (`{type:'composition'}`) against the identity revision the preview started from; a change made meanwhile in another
  window asks whether to reload or apply on top. When the composition names another flagship world, the project switches
  to it; its world values and finish are applied through the ordinary tuning (only tunable, valid values); its music
  profile becomes the project's music preferences (key, mode and motif stay the project's own). The project's digital
  life and structure stay. Every window, the OBS view, recordings and replays then show it.
- **Cancel** discards the unsaved changes (after asking) and shows the project's saved look again. Leaving the studio
  stops the preview; the working copy is kept for the rest of the page's life, never in browser storage.

## Share: export and import

**Export** turns a saved composition into a data-only visual pack (`kind: "declarative"`, `sdk: "^1.2"`, an id
`creator.<name>-<6 hex>`, the author name and license the artist chooses): `pack.json` with the composition and a
README that describes every layer and mapping in words. *Inspect contents* shows both files exactly; *Download .zip*
writes them with a small stored-entry ZIP writer (`public/ui/zip.js`). The receiver checks the manifest as an import
would before handing it out. Nothing of a project — its name, files, paths, structure, identity, recipe — nor anything
about the computer is ever part of it.

Another installation imports it through **Visual Packs → Import a pack** (zip or folder), sees *Data only*, and installs
it without approval. It appears under *Imported creations*: **Use** applies it to the selected project, **Open in Artist
Studio** copies it into My creations for editing.

## Limits and safety

- At most 8 layers and a rendering budget of 100 per composition (a particle layer's cost grows with its count and
  trails); a change past either is refused and said, never silently dropped. 6 mappings per layer, 4 for the whole
  composition, 48 world values, 100 compositions in the library.
- Only the six allowlisted layer types and the listed signals and targets exist; values are clamped and unknown keys
  dropped; names are text (control characters and angle brackets are removed).
- A creation pack can contain no code file; unknown layer types, unknown signals and oversized budgets are rejected at
  import.

## Routes

`#/artist` (the working copy, or the composition last opened here), `#/artist/new/<starter>`,
`#/artist/from/<family>` (`fractal-biosphere`, `stellar-forge`, `machine-cathedral` or `canvas`),
`#/artist/edit/<composition id>`, and `#/artist/project` (the composition the selected project shows).

## Receiver API

| Route | |
|---|---|
| `GET /api/compositions` | the library: every composition with its version and a summary of its previous versions |
| `POST /api/compositions` (control capability, `ifRevision`, 64 KiB) | one action: `create` (`starter` or `composition`, `name`, `origin`), `update` (`id`, `composition`, `ifVersion`), `rename`, `duplicate`, `delete`, `restore` (`id`, `version`); a new composition's id is in `created` |
| `GET /api/compositions/export?id&author&license&description` | the export: `{id, name, version, folder, manifest, files:[{path, data (base64), size}]}` |
| `POST /api/recipe` `{action:{type:'composition', composition}}` | apply a composition on a project (`composition: null` removes it) |

The change feed announces `compositions` with the library's revision, which its `hello` also carries.
